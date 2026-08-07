const Asset = require('../models/Asset');
const asyncHandler = require('../utils/asyncHandler');
const { callGroq, callGroqRaw, callGroqStream } = require('../utils/groqClient');
const { toolDefinitions, executeTool } = require('../utils/dbTools');

/**
 * AI Capabilities module.
 * Most functions here are rule-based / heuristic logic so the project runs
 * fully self-contained without requiring any external AI API key. The chat
 * assistant is the exception: if GROQ_API_KEY is set in .env, it calls the
 * free Groq API for real LLM-generated replies. Admin/Manager get full
 * database function-calling (the LLM can query assets, employees, repairs,
 * AMC contracts, licenses, vendors on demand to answer nearly anything);
 * Employees get a lighter grounded-stats mode (no org-wide data access via
 * chat, consistent with what they can already see elsewhere in the app).
 * If Groq isn't configured, or a call fails, it automatically falls back to
 * the same keyword-matching logic as before, so the app still works with
 * zero setup either way.
 */

// @desc Keyword-based fallback chat logic - used when Groq isn't configured
// or its API call fails for any reason.
function ruleBasedReply(message) {
  const m = message.toLowerCase();
  if (m.includes('how many') && m.includes('available')) return { key: 'available' };
  if (m.includes('repair')) return { key: 'repair' };
  if (m.includes('warranty')) return { key: 'warranty' };
  if (m.includes('total') && m.includes('asset')) return { key: 'total' };
  return { key: 'fallback' };
}

async function getRuleBasedAnswer(message) {
  const { key } = ruleBasedReply(message);
  switch (key) {
    case 'available': {
      const count = await Asset.countDocuments({ status: 'Available' });
      return `There are currently ${count} asset(s) marked as Available.`;
    }
    case 'repair': {
      const count = await Asset.countDocuments({ status: 'In Repair' });
      return `There are ${count} asset(s) currently in repair.`;
    }
    case 'warranty': {
      const thirtyDays = new Date(); thirtyDays.setDate(thirtyDays.getDate() + 30);
      const count = await Asset.countDocuments({ warrantyExpiry: { $lte: thirtyDays, $gte: new Date() } });
      return `${count} asset(s) have warranty expiring within the next 30 days.`;
    }
    case 'total': {
      const count = await Asset.countDocuments();
      return `The total number of assets in the system is ${count}.`;
    }
    default:
      return "I can help with questions like: 'how many assets are available', 'show assets under repair', or 'assets expiring warranty soon'.";
  }
}

// @desc Natural language asset search - parses simple free-text queries
// @route GET /api/ai/search?q=laptops in repair purchased after 2022
exports.naturalLanguageSearch = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const query = {};

  const statusMap = {
    'available': 'Available', 'assigned': 'Assigned', 'in repair': 'In Repair',
    'repair': 'In Repair', 'retired': 'Retired', 'scrapped': 'Scrapped'
  };
  for (const [keyword, status] of Object.entries(statusMap)) {
    if (q.includes(keyword)) { query.status = status; break; }
  }

  const yearMatch = q.match(/(20\d{2})/);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    if (q.includes('after')) {
      query.purchaseDate = { $gte: new Date(`${year}-01-01`) };
    } else if (q.includes('before')) {
      query.purchaseDate = { $lte: new Date(`${year}-12-31`) };
    } else {
      query.purchaseDate = { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) };
    }
  }

  const keywordTokens = q
    .replace(/(available|assigned|in repair|repair|retired|scrapped|after|before|20\d{2})/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  if (keywordTokens.length) {
    query.$or = keywordTokens.map(word => ({
      $or: [
        { name: { $regex: word, $options: 'i' } },
        { brand: { $regex: word, $options: 'i' } },
        { model: { $regex: word, $options: 'i' } }
      ]
    })).flatMap(c => c.$or);
  }

  const results = await Asset.find(query).populate('category vendor location').limit(100);
  res.json({ success: true, interpretedQuery: query, count: results.length, data: results });
});

const MAX_TOOL_ROUNDS = 5; // safety cap so a confused model can't loop forever
const MAX_HISTORY_TURNS = 12; // keep the last N prior user/assistant turns for conversation memory

const PRIVILEGED_SYSTEM_PROMPT =
  `You are the AI assistant inside ITAMS, an IT Asset Management System. ` +
  `You have tools to look up real, live data about assets, employees, repairs, AMC contracts, ` +
  `software licenses, vendors, warranty status, inventory breakdowns, and analytics - use them whenever ` +
  `a question needs actual data instead of guessing. You can call multiple tools if a question needs more ` +
  `than one lookup, and you can chain tool calls to answer analytical questions. ` +
  `This conversation may include earlier turns - when the user refines or narrows a previous request ` +
  `(e.g. "only available ones", "only in Delhi", "sort by newest"), re-run the lookup combining the new ` +
  `filter with whatever was already established in the conversation, rather than asking them to repeat everything. ` +
  `Keep answers professional, concise, and conversational: a short lead sentence, then a brief bulleted ` +
  `breakdown for multi-item results (e.g. counts by status). For large result sets, prefer a compact markdown ` +
  `table over a long list. If a tool returns no results, say so plainly rather than inventing an answer. ` +
  `If a request is outside what your tools cover (e.g. tickets, purchase orders, or asset transfer/audit ` +
  `history - none of which exist in this system yet), say so briefly instead of guessing.`;

// Only used for the round-trip tool-resolution loop; the final natural-language
// answer is regenerated separately (and streamed) once no more tools are needed.
// Groq's models occasionally emit a malformed pseudo function-call (plain
// text like "<function=name{...}</function>" instead of a real structured
// tool call) and the API rejects it with a 400 tool_use_failed error. This
// is an intermittent model quirk, not a real failure - worth one retry
// before giving up on tool-calling for this turn.
function isToolUseFailure(err) {
  return /tool_use_failed|Groq API error 400/i.test(err.message || '');
}

async function resolveToolCalls(messages) {
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let assistantMessage;
    try {
      // Lower temperature than a normal reply - more deterministic tool-call
      // formatting, which measurably cuts down on malformed function calls.
      assistantMessage = await callGroqRaw(messages, { tools: toolDefinitions, temperature: 0.1 });
    } catch (err) {
      if (!isToolUseFailure(err)) throw err;

      console.warn('[AI Chat] Malformed tool call from model, retrying once:', err.message);
      try {
        assistantMessage = await callGroqRaw(messages, { tools: toolDefinitions, temperature: 0.1 });
      } catch (retryErr) {
        if (!isToolUseFailure(retryErr)) throw retryErr;
        // Tool-calling isn't cooperating this turn - degrade to a plain LLM
        // answer (no tools) rather than losing the whole reply to the much
        // more limited keyword-based fallback.
        console.warn('[AI Chat] Tool-calling failed twice, answering without tools:', retryErr.message);
        const plainReply = await callGroq(messages);
        return { resolved: true, messages, finalContent: plainReply };
      }
    }

    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return { resolved: true, messages, finalContent: assistantMessage.content?.trim() || "I wasn't able to find an answer to that." };
    }

    messages.push({ role: 'assistant', content: assistantMessage.content || null, tool_calls: assistantMessage.tool_calls });

    for (const toolCall of assistantMessage.tool_calls) {
      let args = {};
      try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch { /* leave empty on bad JSON */ }
      const result = await executeTool(toolCall.function.name, args);
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: JSON.stringify(result)
      });
    }
  }

  return { resolved: false, messages, finalContent: "I looked into that but couldn't reach a final answer in time - try rephrasing or asking a more specific question." };
}

// Builds the initial message list for the privileged (Admin/Manager) path,
// including prior conversation turns so follow-up/refinement questions work.
function buildPrivilegedMessages(message, history) {
  const trimmedHistory = sanitizeHistory(history);
  return [
    { role: 'system', content: PRIVILEGED_SYSTEM_PROMPT },
    ...trimmedHistory,
    { role: 'user', content: message }
  ];
}

// Keeps only plain user/assistant text turns (no tool-call internals) and
// caps how far back we carry context, to bound prompt size.
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(h => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map(h => ({ role: h.role, content: h.content.trim() }));
}

// Runs the Groq function-calling loop: the model can call one or more
// database tools, see their results, and call more tools or give a final
// answer - repeating until it answers directly or the round cap is hit.
async function runToolCallingChat(message, history) {
  const messages = buildPrivilegedMessages(message, history);
  const { finalContent } = await resolveToolCalls(messages);
  return finalContent;
}

// @desc Chat assistant - uses Groq (real LLM) when configured. Admin/Manager
// get full database tool-calling access so it can answer almost any
// question about live data; Employees get a lighter grounded-stats mode
// with no org-wide data access via chat. Falls back automatically to the
// keyword-based assistant if Groq isn't set up or a call fails.
// @route POST /api/ai/chat  { message: "how many laptops are available?" }
exports.chatAssistant = asyncHandler(async (req, res) => {
  const message = (req.body.message || '').trim();
  const history = req.body.history;
  if (!message) {
    return res.json({ success: true, data: { reply: 'Ask me something about your assets - e.g. "how many laptops are available?"' } });
  }

  if (!process.env.GROQ_API_KEY) {
    const reply = await getRuleBasedAnswer(message);
    return res.json({ success: true, data: { reply, source: 'rule-based' } });
  }

  const isPrivileged = ['Admin', 'Manager'].includes(req.user?.roleName);

  try {
    if (isPrivileged) {
      const reply = await runToolCallingChat(message, history);
      return res.json({ success: true, data: { reply, source: 'groq-tools' } });
    }

    const reply = await callGroq(await buildEmployeeMessages(message, history));
    res.json({ success: true, data: { reply, source: 'groq' } });
  } catch (err) {
    console.error('[AI Chat] Groq call failed, falling back to rule-based reply:', err.message);
    const reply = await getRuleBasedAnswer(message);
    res.json({ success: true, data: { reply, source: 'rule-based-fallback' } });
  }
});

// Builds the message list for the lighter Employee chat mode: grounded in a
// live stats snapshot (no direct DB tool access), plus prior conversation turns.
async function buildEmployeeMessages(message, history) {
  const thirtyDays = new Date(); thirtyDays.setDate(thirtyDays.getDate() + 30);
  const [total, available, assigned, inRepair, warrantyExpiring] = await Promise.all([
    Asset.countDocuments(),
    Asset.countDocuments({ status: 'Available' }),
    Asset.countDocuments({ status: 'Assigned' }),
    Asset.countDocuments({ status: 'In Repair' }),
    Asset.countDocuments({ warrantyExpiry: { $lte: thirtyDays, $gte: new Date() } })
  ]);

  const systemPrompt = `You are the AI assistant inside ITAMS, an IT Asset Management System, talking to an ` +
    `Employee (not IT staff) - keep answers general and org-wide only, not about specific other employees. ` +
    `Answer briefly (2-4 sentences) using the live stats below when relevant. This conversation may include ` +
    `earlier turns - use them for context on follow-up questions.\n\n` +
    `Live asset stats:\n- Total assets: ${total}\n- Available: ${available}\n- Assigned: ${assigned}\n` +
    `- In Repair: ${inRepair}\n- Warranty expiring within 30 days: ${warrantyExpiring}`;

  return [
    { role: 'system', content: systemPrompt },
    ...sanitizeHistory(history),
    { role: 'user', content: message }
  ];
}

// @desc Streaming chat assistant (Server-Sent Events) - same logic as
// chatAssistant, but the final natural-language answer is streamed token by
// token for a real typing effect. Tool-calling rounds themselves are not
// streamed (function-calling needs structured, complete responses); once
// the model has everything it needs, the final answer is regenerated as a
// plain streamed completion using the same resolved context.
// @route POST /api/ai/chat/stream  { message, history }
exports.chatAssistantStream = asyncHandler(async (req, res) => {
  const message = (req.body.message || '').trim();
  const history = req.body.history;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, data) => {
    if (event) res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (!message) {
    send(null, { delta: 'Ask me something about your assets - e.g. "how many laptops are available?"' });
    send('done', { source: 'empty' });
    return res.end();
  }

  if (!process.env.GROQ_API_KEY) {
    const reply = await getRuleBasedAnswer(message);
    send(null, { delta: reply });
    send('done', { source: 'rule-based' });
    return res.end();
  }

  const isPrivileged = ['Admin', 'Manager'].includes(req.user?.roleName);

  try {
    if (isPrivileged) {
      const messages = buildPrivilegedMessages(message, history);
      const { resolved, finalContent } = await resolveToolCalls(messages);

      // finalContent is already fully known at this point (whether resolved
      // normally, degraded to a plain answer after a tool-call glitch, or a
      // round-limit timeout) - simulate the streamed typing effect over it
      // rather than spending a second/third Groq call regenerating the same
      // text. This roughly halves token usage per privileged chat turn.
      await fakeStream(finalContent, (chunk) => send(null, { delta: chunk }));
      send('done', { source: resolved ? 'groq-tools' : 'groq-tools-timeout' });
      return res.end();
    }

    const messages = await buildEmployeeMessages(message, history);
    await callGroqStream(messages, { onDelta: (chunk) => send(null, { delta: chunk }) });
    send('done', { source: 'groq' });
    res.end();
  } catch (err) {
    console.error('[AI Chat Stream] Groq call failed, falling back to rule-based reply:', err.message);
    const reply = await getRuleBasedAnswer(message);
    send(null, { delta: reply });
    send('done', { source: 'rule-based-fallback' });
    res.end();
  }
});

// Simulates a token-by-token stream over text we already have in full,
// instead of spending an extra Groq API call purely for the streaming
// effect. Chunks by a few words at a time with a tiny delay.
async function fakeStream(text, onDelta) {
  const words = (text || '').split(/(\s+)/); // keep whitespace as its own tokens
  let buffer = '';
  for (let i = 0; i < words.length; i++) {
    buffer += words[i];
    if (buffer.length >= 3 || i === words.length - 1) {
      onDelta(buffer);
      buffer = '';
      await new Promise(r => setTimeout(r, 12));
    }
  }
}

// @desc Predict assets whose warranty will expire soon
// @route GET /api/ai/warranty-prediction?days=60
exports.warrantyExpiryPrediction = asyncHandler(async (req, res) => {
  const days = Number(req.query.days) || 60;
  const future = new Date(); future.setDate(future.getDate() + days);
  const assets = await Asset.find({ warrantyExpiry: { $lte: future, $gte: new Date() } })
    .populate('category vendor').sort({ warrantyExpiry: 1 });

  const predictions = assets.map(a => {
    const daysLeft = Math.ceil((a.warrantyExpiry - new Date()) / (1000 * 60 * 60 * 24));
    return { asset: a, daysLeft, riskLevel: daysLeft <= 15 ? 'High' : daysLeft <= 30 ? 'Medium' : 'Low' };
  });

  res.json({ success: true, count: predictions.length, data: predictions });
});

// @desc Detect potential duplicate assets by comparing serial numbers / name+brand+model similarity
// @route GET /api/ai/duplicate-detection
exports.duplicateDetection = asyncHandler(async (req, res) => {
  const assets = await Asset.find();
  const groups = {};

  assets.forEach(a => {
    if (a.serialNumber) {
      const key = `serial:${a.serialNumber.trim().toLowerCase()}`;
      groups[key] = groups[key] || [];
      groups[key].push(a);
    }
    const nameKey = `combo:${(a.name || '').toLowerCase()}|${(a.brand || '').toLowerCase()}|${(a.model || '').toLowerCase()}`;
    groups[nameKey] = groups[nameKey] || [];
    groups[nameKey].push(a);
  });

  const duplicates = Object.entries(groups)
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ matchedOn: key, assets: list }));

  res.json({ success: true, count: duplicates.length, data: duplicates });
});

// @desc Heuristic asset health score based on age, condition and repair count
// @route GET /api/ai/health-prediction
exports.assetHealthPrediction = asyncHandler(async (req, res) => {
  const Repair = require('../models/Repair');
  const assets = await Asset.find();
  const repairCounts = await Repair.aggregate([
    { $group: { _id: '$asset', count: { $sum: 1 } } }
  ]);
  const repairMap = new Map(repairCounts.map(r => [String(r._id), r.count]));

  const results = assets.map(a => {
    const ageYears = a.purchaseDate ? (Date.now() - a.purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365) : 0;
    const repairs = repairMap.get(String(a._id)) || 0;
    const conditionScore = { New: 100, Good: 80, Fair: 55, Poor: 25 }[a.condition] ?? 60;

    let score = conditionScore - (ageYears * 5) - (repairs * 8);
    score = Math.max(0, Math.min(100, Math.round(score)));

    let recommendation = 'Keep in service';
    if (score < 35) recommendation = 'Recommend Scrap';
    else if (score < 60) recommendation = 'Recommend Replace';
    else if (repairs >= 2) recommendation = 'Monitor / Consider Repair Review';

    return { asset: a, healthScore: score, ageYears: Number(ageYears.toFixed(1)), repairCount: repairs, recommendation };
  }).sort((a, b) => a.healthScore - b.healthScore);

  res.json({ success: true, count: results.length, data: results });
});

// @desc Smart dashboard summary - plain-language narrative built from live stats
// @route GET /api/ai/smart-summary
exports.smartSummary = asyncHandler(async (req, res) => {
  const total = await Asset.countDocuments();
  const available = await Asset.countDocuments({ status: 'Available' });
  const assigned = await Asset.countDocuments({ status: 'Assigned' });
  const inRepair = await Asset.countDocuments({ status: 'In Repair' });
  const thirtyDays = new Date(); thirtyDays.setDate(thirtyDays.getDate() + 30);
  const warrantyExpiring = await Asset.countDocuments({ warrantyExpiry: { $lte: thirtyDays, $gte: new Date() } });

  const utilizationPct = total ? Math.round((assigned / total) * 100) : 0;

  const summary = `Your organization currently manages ${total} IT asset(s). ` +
    `${assigned} (${utilizationPct}%) are actively assigned to employees, ${available} are available for allocation, ` +
    `and ${inRepair} are undergoing repair. ` +
    (warrantyExpiring > 0
      ? `Attention: ${warrantyExpiring} asset(s) have warranties expiring within 30 days.`
      : `No assets have warranties expiring in the next 30 days.`);

  res.json({ success: true, data: { summary, total, available, assigned, inRepair, warrantyExpiring, utilizationPct } });
});

// @desc Manually trigger the automatic compliance/notification checks right now
//       (the same job that otherwise runs automatically on a schedule).
//       Useful for testing without waiting for the next scheduled run.
// @route POST /api/ai/run-compliance-checks
exports.runComplianceChecksNow = asyncHandler(async (req, res) => {
  const scheduler = require('../services/notificationScheduler');
  const result = await scheduler.runComplianceChecks();
  res.json({ success: true, message: 'Compliance checks completed', data: result });
});
