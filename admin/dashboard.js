let allSessions = {};
let allChats = [];
let currentFilter = 'all';

// Show toast notification
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    toastMessage.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Load all data
async function loadAllData() {
    await Promise.all([
        loadStats(),
        loadSessions(),
        loadChats()
    ]);
}

// Load stats
async function loadStats() {
    try {
        const response = await fetch('/api/admin/stats');
        const stats = await response.json();
        
        document.getElementById('total-messages').textContent = stats.totalMessages;
        document.getElementById('total-users').textContent = stats.totalUsers;
        document.getElementById('active-today').textContent = stats.activeToday;
        document.getElementById('avg-messages').textContent = stats.averageMessagesPerUser.toFixed(1);
    } catch (error) {
        console.error('Error loading stats:', error);
        showToast('Error loading statistics');
    }
}

// Load sessions
async function loadSessions() {
    try {
        const response = await fetch('/api/admin/sessions');
        allSessions = await response.json();
        displaySessions();
    } catch (error) {
        console.error('Error loading sessions:', error);
        showToast('Error loading sessions');
    }
}

// Display sessions
function displaySessions() {
    const container = document.getElementById('sessions-list');
    const sessionsList = Object.values(allSessions);

    if (sessionsList.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">
                    <i class="fas fa-user-slash"></i>
                </div>
                <p>No sessions yet</p>
            </div>
        `;
        return;
    }

    // Filter by time
    let filtered = sessionsList;
    if (currentFilter === 'today') {
        const today = new Date().toDateString();
        filtered = sessionsList.filter(s => new Date(s.lastSeen).toDateString() === today);
    } else if (currentFilter === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        filtered = sessionsList.filter(s => new Date(s.lastSeen) >= weekAgo);
    }

    // Sort by last seen
    filtered.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

    container.innerHTML = filtered.map(session => `
        <div class="session-item" onclick="loadUserChats('${session.userId}')">
            <div class="session-info">
                <div class="user-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div>
                    <div class="user-id">User: ${session.userId.substring(0, 16)}...</div>
                    <div class="meta">
                        <i class="far fa-clock"></i>
                        Last seen: ${new Date(session.lastSeen).toLocaleString()}
                    </div>
                </div>
            </div>
            <div class="session-badge">${session.messageCount} msgs</div>
        </div>
    `).join('');
}

// Load chats
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

// Display chats
function displayChats(chats) {
    const container = document.getElementById('chats-list');

    if (chats.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">
                    <i class="fas fa-comments"></i>
                </div>
                <p>No chats yet</p>
            </div>
        `;
        return;
    }

    // Sort by timestamp (newest first)
    const sorted = [...chats].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    container.innerHTML = sorted.map(chat => `
        <div class="chat-message">
            <div class="header-row">
                <div class="user-badge">
                    <i class="fas fa-user-circle"></i>
                    User: ${chat.userId.substring(0, 12)}...
                </div>
                <div class="timestamp">
                    <i class="far fa-clock"></i>
                    ${new Date(chat.timestamp).toLocaleString()}
                </div>
            </div>
            <div class="message-bubble user-msg">
                ${chat.userMessage}
            </div>
            <div class="message-bubble ai-msg">
                ${chat.aiResponse}
            </div>
        </div>
    `).join('');
}

// Load specific user chats
async function loadUserChats(userId) {
    try {
        const response = await fetch(`/api/admin/user/${userId}`);
        const userChats = await response.json();
        displayChats(userChats);
        
        // Scroll to chats section
        document.querySelector('.chats-section').scrollIntoView({ behavior: 'smooth' });
        showToast(`Loaded ${userChats.length} messages from user`);
    } catch (error) {
        console.error('Error loading user chats:', error);
        showToast('Error loading user chats');
    }
}

// Filter sessions
function filterSessions() {
    const search = document.getElementById('search-sessions').value.toLowerCase();

    const filtered = Object.values(allSessions).filter(s => 
        s.userId.toLowerCase().includes(search)
    );  
    
    const container = document.getElementById('sessions-list');
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">
                    <i class="fas fa-search"></i>
                </div>
                <p>No matching sessions</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(session => `
        <div class="session-item" onclick="loadUserChats('${session.userId}')">
            <div class="session-info">
                <div class="user-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div>
                    <div class="user-id">User: ${session.userId.substring(0, 16)}...</div>
                    <div class="meta">
                        <i class="far fa-clock"></i>
                        Last seen: ${new Date(session.lastSeen).toLocaleString()}
                    </div>
                </div>
            </div>
            <div class="session-badge">${session.messageCount} msgs</div>
        </div>
    `).join('');
}

// Filter chats
function filterChats() {
    const search = document.getElementById('search-chats').value.toLowerCase();
    const filtered = allChats.filter(chat => 
        chat.userMessage.toLowerCase().includes(search) ||
        chat.aiResponse.toLowerCase().includes(search) ||
        chat.userId.toLowerCase().includes(search)
    );
    displayChats(filtered);
}

// Filter by time
function filterByTime(filter) {
    currentFilter = filter;
    
    // Update button states
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    displaySessions();
}

// Refresh data
async function refreshData() {
    showToast('Refreshing data...');
    await loadAllData();
    showToast('Data refreshed successfully!');
}

// Export data
function exportData() {
    const data = {
        sessions: allSessions,
        chats: allChats,
        exportedAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bitlon-chats-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    showToast('Data exported successfully!');
}

// Delete all chats
async function deleteAllChats() {
    if (!confirm('⚠️ Are you sure you want to delete ALL chat data? This cannot be undone!')) {
        return;
    }

    try {
        await fetch('/api/admin/chats', { method: 'DELETE' });
        showToast('All data deleted successfully');
        await loadAllData();
    } catch (error) {
        console.error('Error deleting chats:', error);
        showToast('Error deleting data');
    }
}

// Load data on page load
loadAllData();

// Auto-refresh every 30 seconds
setInterval(loadAllData, 30000);