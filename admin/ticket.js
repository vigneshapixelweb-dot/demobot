let currentTicket = null;

function qs(id) {
  return document.getElementById(id);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function formatDate(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
}

function getTicketCode() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('ticket') || '').trim();
}

function setError(message) {
  const error = qs('error');
  if (error) {
    error.textContent = message || '';
  }
}

function renderTicket(ticket) {
  currentTicket = ticket;

  const ticketCode = ticket.ticketCode || 'Unknown';
  const status = (ticket.status || 'open').toLowerCase();
  const pill = qs('status-pill');
  pill.textContent = status.toUpperCase();
  pill.classList.toggle('closed', status === 'closed');

  qs('ticket-title').textContent = `Ticket ${ticketCode}`;

  qs('ticket-meta').innerHTML = `
    <div class="meta-item"><strong>User</strong>${escapeHtml(ticket.userId || 'Unknown')}</div>
    <div class="meta-item"><strong>Source</strong>${escapeHtml(ticket.source || 'unknown')}</div>
    <div class="meta-item"><strong>Created</strong>${formatDate(ticket.createdAt)}</div>
    <div class="meta-item"><strong>Updated</strong>${formatDate(ticket.updatedAt)}</div>
    <div class="meta-item"><strong>Issue Summary</strong>${escapeHtml(ticket.issueSummary || 'No summary')}</div>
  `;

  const history = Array.isArray(ticket.history) ? ticket.history : [];
  const historyEl = qs('history');

  if (!history.length) {
    historyEl.innerHTML = '<div class="note">No conversation history for this ticket.</div>';
  } else {
    historyEl.innerHTML = history
      .map((msg) => {
        const role = msg.role === 'admin' ? 'admin' : msg.role === 'assistant' ? 'ai' : 'user';
        const label = role === 'admin' ? `ADMIN${msg.adminName ? ` (${escapeHtml(msg.adminName)})` : ''}` : role === 'ai' ? 'AI' : 'USER';
        const timestamp = formatDate(msg.timestamp);

        return `
          <div class="msg ${role}">
            <div class="msg-head">
              <span>${label}</span>
              <span>${timestamp}</span>
            </div>
            <div>${escapeHtml(msg.content || '')}</div>
          </div>
        `;
      })
      .join('');
  }

  const isClosed = status === 'closed';
  qs('reply-btn').disabled = isClosed;
  qs('close-btn').disabled = isClosed;
  qs('admin-reply').disabled = isClosed;

  if (isClosed) {
    qs('admin-reply').placeholder = 'Ticket is closed';
  } else {
    qs('admin-reply').placeholder = 'Type a reply for this ticket...';
  }
}

async function loadTicket() {
  const ticketCode = getTicketCode();
  if (!ticketCode) {
    setError('Missing ticket code in URL');
    return;
  }

  setError('');

  try {
    const response = await fetch(`/api/admin/tickets/${encodeURIComponent(ticketCode)}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Unable to load ticket');
    }

    const ticket = await response.json();
    renderTicket(ticket);
  } catch (error) {
    console.error('Ticket load error:', error);
    setError(error.message || 'Unable to load ticket');
  }
}

async function sendReply() {
  const ticketCode = getTicketCode();
  const textarea = qs('admin-reply');
  const reply = textarea.value.trim();

  if (!reply) {
    setError('Reply message is required');
    return;
  }

  setError('');

  try {
    const response = await fetch(`/api/admin/tickets/${encodeURIComponent(ticketCode)}/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: reply,
        adminName: 'Admin',
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to send reply');
    }

    textarea.value = '';
    await loadTicket();
  } catch (error) {
    console.error('Ticket reply error:', error);
    setError(error.message || 'Failed to send reply');
  }
}

async function closeTicket() {
  const ticketCode = getTicketCode();
  if (!confirm('Close this ticket?')) {
    return;
  }

  setError('');

  try {
    const response = await fetch(`/api/admin/tickets/${encodeURIComponent(ticketCode)}/close`, {
      method: 'POST',
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to close ticket');
    }

    await loadTicket();
  } catch (error) {
    console.error('Ticket close error:', error);
    setError(error.message || 'Failed to close ticket');
  }
}

function reloadTicket() {
  loadTicket();
}

window.sendReply = sendReply;
window.closeTicket = closeTicket;
window.reloadTicket = reloadTicket;

loadTicket();
