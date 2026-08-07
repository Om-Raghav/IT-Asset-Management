/**
 * Floating AI chat widget - a small bubble in the bottom-right corner on
 * every authenticated page (injected via renderLayout in common.js), that
 * expands into a chat panel. Built as plain HTML/CSS/jQuery + native fetch
 * (this project has no React/build tooling), matching the same
 * "floating bubble -> expandable panel" UX that libraries like
 * react-chat-widget provide.
 *
 * Talks to POST /api/ai/chat/stream (Server-Sent Events) for a real
 * token-by-token typing effect, with a fallback to the plain
 * POST /api/ai/chat endpoint if streaming isn't available for any reason.
 *
 * Features: conversation memory (recent turns are sent back with every
 * request so follow-up/refinement questions work), lightweight markdown
 * rendering (bold, lists, tables, inline code), and a copy button on each
 * assistant reply.
 */

// In-memory conversation history for this page session: [{ role, content }]
let chatHistory = [];
const MAX_HISTORY_SENT = 12;

function initChatWidget() {
  if ($('#chatWidgetRoot').length === 0) {
    $('body').append(`
      <div id="chatWidgetRoot">
        <div id="chatWidgetPanel" class="chat-widget-panel d-none">
          <div class="chat-widget-header">
            <span><i class="bi bi-robot me-2"></i>AI Assistant</span>
            <button type="button" id="chatWidgetClose" class="btn-close btn-close-white"></button>
          </div>
          <div id="chatWidgetMessages" class="chat-widget-messages"></div>
          <form id="chatWidgetForm" class="chat-widget-input-row">
            <input type="text" id="chatWidgetInput" class="form-control form-control-sm" placeholder="Ask about your assets...">
            <button type="submit" class="btn btn-primary btn-sm"><i class="bi bi-send-fill"></i></button>
          </form>
        </div>
        <button type="button" id="chatWidgetFab" class="chat-widget-fab" title="AI Assistant">
          <i class="bi bi-robot"></i>
        </button>
      </div>
    `);

    appendChatWidgetMessage('assistant', renderMarkdown('Hi! Ask me things like "show Dell laptops", "which warranties expire this month", or "how many assets does Finance have".'));
  }

  $('#chatWidgetFab').off('click').on('click', () => {
    $('#chatWidgetPanel').removeClass('d-none');
    $('#chatWidgetFab').addClass('d-none');
    $('#chatWidgetInput').trigger('focus');
  });

  $('#chatWidgetClose').off('click').on('click', () => {
    $('#chatWidgetPanel').addClass('d-none');
    $('#chatWidgetFab').removeClass('d-none');
  });

  $('#chatWidgetForm').off('submit').on('submit', function (e) {
    e.preventDefault();
    const message = $('#chatWidgetInput').val().trim();
    if (!message) return;
    $('#chatWidgetInput').val('');
    sendChatMessage(message);
  });
}

function sendChatMessage(message) {
  appendChatWidgetMessage('user', escapeHtml(message));
  chatHistory.push({ role: 'user', content: message });

  const typingId = appendChatWidgetMessage('assistant', '<span class="chat-widget-typing"><span></span><span></span><span></span></span>');
  const bubbleSelector = `#${typingId} .chat-widget-bubble`;
  let started = false;
  let fullReply = '';

  streamChat(message, chatHistory.slice(0, -1).slice(-MAX_HISTORY_SENT), {
    onDelta: (chunk) => {
      if (!started) { $(bubbleSelector).empty(); started = true; }
      fullReply += chunk;
      $(bubbleSelector).html(renderMarkdown(fullReply));
      scrollChatToBottom();
    },
    onDone: () => {
      if (!fullReply) $(bubbleSelector).text("Sorry, I couldn't reach the assistant just now.");
      finalizeAssistantMessage(typingId, fullReply);
    },
    onError: () => {
      $(bubbleSelector).text("Sorry, I couldn't reach the assistant just now.");
    }
  });
}

function finalizeAssistantMessage(msgId, fullReply) {
  chatHistory.push({ role: 'assistant', content: fullReply });
  addCopyButton(msgId, fullReply);
}

// Streams a reply via POST /api/ai/chat/stream (SSE-formatted body over a
// plain fetch, since EventSource can't send POST bodies or auth headers).
// Falls back to the non-streaming /api/ai/chat endpoint on any failure.
async function streamChat(message, history, { onDelta, onDone, onError }) {
  const token = Api.getToken();
  try {
    const response = await fetch(`${API_BASE_URL}/ai/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ message, history })
    });

    if (!response.ok || !response.body) throw new Error('Stream request failed');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const evt of events) {
        const dataLine = evt.split('\n').find(l => l.startsWith('data:'));
        if (!dataLine) continue;
        let payload;
        try { payload = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
        if (evt.startsWith('event: done')) { onDone(); return; }
        if (payload.delta) onDelta(payload.delta);
      }
    }
    onDone();
  } catch (err) {
    // Fall back to the plain non-streaming endpoint.
    Api.post('/ai/chat', { message, history }).done(res => {
      onDelta(res.data.reply || '');
      onDone();
    }).fail(() => onError(err));
  }
}

function appendChatWidgetMessage(sender, html) {
  const id = 'cw-msg-' + Date.now() + Math.floor(Math.random() * 1000);
  const align = sender === 'user' ? 'chat-widget-msg-user' : 'chat-widget-msg-assistant';
  $('#chatWidgetMessages').append(`
    <div id="${id}" class="chat-widget-msg ${align}">
      <div class="chat-widget-bubble">${html}</div>
    </div>
  `);
  scrollChatToBottom();
  return id;
}

function scrollChatToBottom() {
  const box = document.getElementById('chatWidgetMessages');
  if (box) box.scrollTop = box.scrollHeight;
}

function addCopyButton(msgId, text) {
  const bubble = $(`#${msgId} .chat-widget-bubble`);
  if (!bubble.length || bubble.find('.chat-widget-copy-btn').length) return;
  const btn = $('<button type="button" class="chat-widget-copy-btn" title="Copy"><i class="bi bi-clipboard"></i></button>');
  btn.on('click', () => {
    navigator.clipboard?.writeText(text).then(() => {
      btn.html('<i class="bi bi-check2"></i>');
      setTimeout(() => btn.html('<i class="bi bi-clipboard"></i>'), 1200);
    });
  });
  bubble.append(btn);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Minimal markdown renderer (no external dependency): bold, italics, inline
// code, bullet/numbered lists, pipe tables, and paragraph/line breaks.
// Covers the "Markdown formatting" / "Tables for large result sets" UI
// requirements without adding a CDN dependency to every page.
function renderMarkdown(src) {
  if (!src) return '';
  const escaped = escapeHtml(src);
  const lines = escaped.split('\n');
  const html = [];
  let i = 0;
  let inList = null; // 'ul' | 'ol' | null

  const closeList = () => { if (inList) { html.push(`</${inList}>`); inList = null; } };
  const inline = (s) => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');

  while (i < lines.length) {
    const line = lines[i];

    // Pipe table: header line + separator line (---|---)
    if (/^\s*\|.*\|\s*$/.test(line) && lines[i + 1] && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      closeList();
      const headerCells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      html.push('<table class="chat-widget-table"><thead><tr>' + headerCells.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        html.push('<tr>' + cells.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>');
        i++;
      }
      html.push('</tbody></table>');
      continue;
    }

    const bulletMatch = line.match(/^\s*[-•]\s+(.*)$/);
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (bulletMatch) {
      if (inList !== 'ul') { closeList(); html.push('<ul>'); inList = 'ul'; }
      html.push(`<li>${inline(bulletMatch[1])}</li>`);
      i++; continue;
    }
    if (numberedMatch) {
      if (inList !== 'ol') { closeList(); html.push('<ol>'); inList = 'ol'; }
      html.push(`<li>${inline(numberedMatch[1])}</li>`);
      i++; continue;
    }

    closeList();
    if (line.trim() === '') { html.push('<br>'); } else { html.push(`<p>${inline(line)}</p>`); }
    i++;
  }
  closeList();
  return html.join('');
}
