let allSessions = {};
let allChats = [];
let allTickets = [];
let currentTimeFilter = 'all';

function showToast(message) {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');

  if (!toast || !toastMessage) return;

  toastMessage.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
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

function truncate(value, length = 12) {
  if (!value) return 'Unknown';
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function setFilterButtonState(activeButton) {
  document.querySelectorAll('.filter-btn').forEach((button) => {
    button.classList.remove('active');
  });

  if (activeButton) {
    activeButton.classList.add('active');
  }
}

function getFilteredSessions(searchText = '') {
  const normalizedSearch = searchText.toLowerCase();
  const today = new Date().toDateString();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  return Object.values(allSessions)
    .filter((session) => {
      const userId = (session.userId || session.user_id || '').toLowerCase();
      if (normalizedSearch && !userId.includes(normalizedSearch)) {
        return false;
      }

      const lastSeen = new Date(session.lastSeen || session.last_seen || 0);

      if (currentTimeFilter === 'today') {
        return lastSeen.toDateString() === today;
      }

      if (currentTimeFilter === 'week') {
        return lastSeen >= weekAgo;
      }

      return true;
    })
    .sort((a, b) => {
      const aTime = new Date(a.lastSeen || a.last_seen || 0).getTime();
      const bTime = new Date(b.lastSeen || b.last_seen || 0).getTime();
      return bTime - aTime;
    });
}

function displaySessions(sessions) {
  const container = document.getElementById('sessions-list');
  if (!container) return;

  if (!sessions.length) {
    container.innerHTML = '<div class="empty-state"><div class="icon">👤</div><p>No sessions found</p></div>';
    return;
  }

  container.innerHTML = sessions
    .map((session) => {
      const userId = session.userId || session.user_id || 'Unknown';
      const messageCount = session.messageCount || session.message_count || 0;
      const encodedUserId = encodeURIComponent(userId);

      return `
        <div class="session-item" onclick="loadUserChats('${encodedUserId}')">
          <div>
            <div class="user-id">👤 User: ${escapeHtml(truncate(userId, 18))}</div>
            <div class="meta">🕐 Last seen: ${formatDate(session.lastSeen || session.last_seen)}</div>
          </div>
          <div class="session-badge">${messageCount} msgs</div>
        </div>
      `;
    })
    .join('');
}

function displayChats(chats) {
  const container = document.getElementById('chats-list');
  if (!container) return;

  if (!chats || chats.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">💬</div><p>No chats yet</p></div>';
    return;
  }

  const sortedChats = [...chats].sort((a, b) => {
    const aTime = new Date(a.timestamp || a.created_at || 0).getTime();
    const bTime = new Date(b.timestamp || b.created_at || 0).getTime();
    return bTime - aTime;
  });

  container.innerHTML = sortedChats
    .map((chat) => {
      const userId = chat.userId || chat.user_id || 'Unknown';
      const userMessage = chat.userMessage || chat.user_message || '';
      const aiResponse = chat.aiResponse || chat.ai_response || '';
      const timestamp = chat.timestamp || chat.created_at;

      return `
        <div class="chat-message">
          <div class="header-row">
            <div class="user-badge">User: ${escapeHtml(truncate(userId, 14))}</div>
            <div class="timestamp">🕐 ${formatDate(timestamp)}</div>
          </div>
          <div class="message-bubble user-msg">${escapeHtml(userMessage)}</div>
          <div class="message-bubble ai-msg">${escapeHtml(aiResponse)}</div>
        </div>
      `;
    })
    .join('');
}

function displayTickets(tickets) {
  const container = document.getElementById('tickets-list');
  if (!container) return;

  if (!tickets || tickets.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">🎫</div><p>No tickets raised yet</p></div>';
    return;
  }

  container.innerHTML = tickets
    .map((ticket) => {
      const ticketCode = ticket.ticketCode || ticket.ticket_code || 'Unknown';
      const userId = ticket.userId || ticket.user_id || 'Unknown';
      const issueSummary = ticket.issueSummary || ticket.issue_summary || '';
      const source = ticket.source || 'unknown';
      const createdAt = ticket.createdAt || ticket.created_at;
      const status = ticket.status || 'open';
      const encodedCode = encodeURIComponent(ticketCode);

      return `
        <div class="session-item" onclick="openTicketWindow('${encodedCode}')">
          <div>
            <div class="user-id">🎫 ${escapeHtml(ticketCode)} • ${escapeHtml(status.toUpperCase())}</div>
            <div class="meta">👤 ${escapeHtml(truncate(userId, 18))} • ${escapeHtml(source)} • ${formatDate(createdAt)}</div>
            <div class="meta">${escapeHtml(issueSummary || 'No issue summary')}</div>
          </div>
          <div class="session-badge">${escapeHtml(status)}</div>
        </div>
      `;
    })
    .join('');
}

async function loadStats() {
  try {
    const response = await fetch('/api/admin/stats');
    const stats = await response.json();

    document.getElementById('total-messages').textContent = stats.totalMessages || 0;
    document.getElementById('total-users').textContent = stats.totalUsers || 0;
    document.getElementById('active-today').textContent = stats.activeToday || 0;
    document.getElementById('avg-messages').textContent = (stats.averageMessagesPerUser || 0).toFixed(1);

    const totalTickets = document.getElementById('total-tickets');
    const openTickets = document.getElementById('open-tickets');
    if (totalTickets) totalTickets.textContent = stats.totalTickets || 0;
    if (openTickets) openTickets.textContent = stats.openTickets || 0;
  } catch (error) {
    console.error('Error loading stats:', error);
    showToast('Error loading statistics');
  }
}

async function loadSessions() {
  try {
    const response = await fetch('/api/admin/sessions');
    allSessions = await response.json();
    displaySessions(getFilteredSessions(document.getElementById('search-sessions')?.value || ''));
  } catch (error) {
    console.error('Error loading sessions:', error);
    showToast('Error loading sessions');
  }
}

async function loadChats() {
  try {
    const response = await fetch('/api/admin/chats');
    allChats = await response.json();
    displayChats(allChats);
  } catch (error) {
    console.error('Error loading chats:', error);
    showToast('Error loading chats');
  }
}

async function loadTickets() {
  try {
    const response = await fetch('/api/admin/tickets');
    allTickets = await response.json();
    displayTickets(allTickets);
  } catch (error) {
    console.error('Error loading tickets:', error);
    showToast('Error loading tickets');
  }
}

async function loadAllData() {
  await Promise.all([loadStats(), loadSessions(), loadChats(), loadTickets()]);
}

async function loadUserChats(encodedUserId) {
  try {
    const userId = decodeURIComponent(encodedUserId);
    const response = await fetch(`/api/admin/user/${encodeURIComponent(userId)}`);
    const userChats = await response.json();
    displayChats(userChats);

    const chatsSection = document.querySelector('.chats-section');
    if (chatsSection) {
      chatsSection.scrollIntoView({ behavior: 'smooth' });
    }

    showToast(`Loaded ${userChats.length} messages from ${truncate(userId, 16)}`);
  } catch (error) {
    console.error('Error loading user chats:', error);
    showToast('Error loading user chats');
  }
}

function openTicketWindow(encodedTicketCode) {
  const ticketCode = decodeURIComponent(encodedTicketCode);
  const url = `/admin/ticket.html?ticket=${encodeURIComponent(ticketCode)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function filterSessions() {
  const search = (document.getElementById('search-sessions')?.value || '').toLowerCase();
  displaySessions(getFilteredSessions(search));
}

function filterChats() {
  const search = (document.getElementById('search-chats')?.value || '').toLowerCase();

  const filtered = allChats.filter((chat) => {
    const userMessage = (chat.userMessage || chat.user_message || '').toLowerCase();
    const aiResponse = (chat.aiResponse || chat.ai_response || '').toLowerCase();
    const userId = (chat.userId || chat.user_id || '').toLowerCase();

    return userMessage.includes(search) || aiResponse.includes(search) || userId.includes(search);
  });

  displayChats(filtered);
}

function filterTickets() {
  const search = (document.getElementById('search-tickets')?.value || '').toLowerCase();

  const filtered = allTickets.filter((ticket) => {
    const ticketCode = (ticket.ticketCode || ticket.ticket_code || '').toLowerCase();
    const userId = (ticket.userId || ticket.user_id || '').toLowerCase();
    const issueSummary = (ticket.issueSummary || ticket.issue_summary || '').toLowerCase();

    return ticketCode.includes(search) || userId.includes(search) || issueSummary.includes(search);
  });

  displayTickets(filtered);
}

function filterByTime(filter, button) {
  currentTimeFilter = filter;
  setFilterButtonState(button || null);
  filterSessions();
}

async function refreshData() {
  showToast('Refreshing data...');
  await loadAllData();
  showToast('Data refreshed successfully');
}

function exportData() {
  const data = {
    sessions: allSessions,
    chats: allChats,
    tickets: allTickets,
    exportedAt: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `bitlon-support-export-${new Date().toISOString().split('T')[0]}.json`;
  anchor.click();
  URL.revokeObjectURL(url);

  showToast('Data exported successfully');
}

async function deleteAllChats() {
  if (!confirm('⚠️ Delete all chats and tickets? This cannot be undone.')) {
    return;
  }

  try {
    const response = await fetch('/api/admin/chats', { method: 'DELETE' });

    if (!response.ok) {
      throw new Error('Delete request failed');
    }

    showToast('All chats and tickets deleted');
    await loadAllData();
  } catch (error) {
    console.error('Error deleting data:', error);
    showToast('Error deleting data');
  }
}

loadAllData();
setInterval(loadAllData, 30000);

window.filterByTime = filterByTime;
window.filterSessions = filterSessions;
window.filterChats = filterChats;
window.filterTickets = filterTickets;
window.loadUserChats = loadUserChats;
window.openTicketWindow = openTicketWindow;
window.refreshData = refreshData;
window.exportData = exportData;
window.deleteAllChats = deleteAllChats;
