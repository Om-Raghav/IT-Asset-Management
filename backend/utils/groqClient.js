/**
 * Minimal client for the Groq API (OpenAI-compatible chat completions),
 * including tool/function-calling support so the assistant can query the
 * database on demand rather than being limited to pre-fetched context.
 * Uses Node's built-in fetch (Node 18+), so no extra npm package is
 * needed. Get a free API key at https://console.groq.com and set it as
 * GROQ_API_KEY in backend/.env to enable this - if it's not set, callers
 * should fall back to the built-in rule-based chatbot instead.
 */

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// Returns the raw assistant message object (content and/or tool_calls),
// so callers can inspect tool_calls themselves for a function-calling loop.
async function callGroqRaw(messages, { temperature = 0.4, maxTokens = 600, tools = null } = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set');
  }

  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const body = { model, messages, temperature, max_tokens: maxTokens };
  if (tools) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Groq API error ${response.status}: ${errBody.slice(0, 300)}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error('Groq API returned no message');
  return message;
}

// Simple convenience wrapper for plain (no-tools) calls - returns just the text.
async function callGroq(messages, options = {}) {
  const message = await callGroqRaw(messages, options);
  const reply = message.content;
  if (!reply) throw new Error('Groq API returned no reply content');
  return reply.trim();
}

// Streams a plain (no-tools) completion, invoking onDelta(textChunk) as tokens
// arrive, and resolving with the full accumulated text once done. Used for the
// final answer of a chat turn so the UI can show a real typing/streaming effect.
// No tools param here on purpose - by the time we stream, any tool calls have
// already been resolved and we just want plain text out.
async function callGroqStream(messages, { temperature = 0.4, maxTokens = 600, onDelta } = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set');
  }

  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: true })
  });

  if (!response.ok || !response.body) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Groq API error ${response.status}: ${errBody.slice(0, 300)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // keep last partial line for the next chunk

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          if (onDelta) onDelta(delta);
        }
      } catch {
        // ignore malformed/partial SSE lines
      }
    }
  }

  if (!full) throw new Error('Groq API returned no streamed content');
  return full;
}

module.exports = { callGroq, callGroqRaw, callGroqStream };
