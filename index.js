require('dotenv').config();
const express = require('express');
const Groq = require('groq-sdk');
const os = require('os');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

app.use('/admin', express.static(path.join(__dirname, 'admin')));

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        user_message TEXT NOT NULL,
        ai_response TEXT NOT NULL,
        suggestions JSONB,
        timestamp TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        user_id VARCHAR(255) PRIMARY KEY,
        first_seen TIMESTAMPTZ DEFAULT NOW(),
        last_seen TIMESTAMPTZ DEFAULT NOW(),
        message_count INTEGER DEFAULT 0
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        ticket_code VARCHAR(64) UNIQUE NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        source VARCHAR(64) DEFAULT 'unknown',
        status VARCHAR(32) DEFAULT 'open',
        issue_summary TEXT,
        last_user_message TEXT,
        last_ai_message TEXT,
        history JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_chats_user_timestamp ON chats (user_id, timestamp DESC)'
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets (created_at DESC)'
    );

    console.log('✅ Database initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

async function updateSessionInfo(userId) {
  try {
    const result = await pool.query('SELECT user_id FROM sessions WHERE user_id = $1', [userId]);

    if (result.rows.length === 0) {
      await pool.query('INSERT INTO sessions (user_id, message_count) VALUES ($1, 1)', [userId]);
      return;
    }

    await pool.query(
      'UPDATE sessions SET last_seen = NOW(), message_count = message_count + 1 WHERE user_id = $1',
      [userId]
    );
  } catch (error) {
    console.error('Error updating session:', error);
  }
}

async function saveChatMessage(userId, userMessage, aiResponse, suggestions) {
  try {
    await pool.query(
      'INSERT INTO chats (user_id, user_message, ai_response, suggestions) VALUES ($1, $2, $3, $4)',
      [userId, userMessage, aiResponse, JSON.stringify(suggestions)]
    );

    await updateSessionInfo(userId);
  } catch (error) {
    console.error('Error saving chat:', error);
  }
}

function generateTicketCode() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TKT-${timestamp}-${random}`;
}

function normalizeHistory(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((message) => {
      if (!message || typeof message !== 'object') {
        return null;
      }

      const role = message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : null;
      const content = typeof message.content === 'string' ? message.content.trim() : '';

      if (!role || !content) {
        return null;
      }

      return { role, content };
    })
    .filter(Boolean);
}

async function getTicketByCode(ticketCode) {
  const result = await pool.query(
    `SELECT
      ticket_code AS "ticketCode",
      user_id AS "userId",
      source,
      status,
      issue_summary AS "issueSummary",
      last_user_message AS "lastUserMessage",
      last_ai_message AS "lastAiMessage",
      history,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM tickets
    WHERE ticket_code = $1
    LIMIT 1`,
    [ticketCode]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const ticket = result.rows[0];
  ticket.history = Array.isArray(ticket.history) ? ticket.history : [];
  return ticket;
}

async function appendTicketMessage(ticketCode, role, content, meta = {}) {
  const ticket = await getTicketByCode(ticketCode);
  if (!ticket) {
    return null;
  }

  const updatedHistory = [
    ...ticket.history,
    {
      role,
      content,
      ...meta,
      timestamp: new Date().toISOString(),
    },
  ];

  await pool.query(
    'UPDATE tickets SET history = $1, updated_at = NOW() WHERE ticket_code = $2',
    [JSON.stringify(updatedHistory), ticketCode]
  );

  return getTicketByCode(ticketCode);
}

function buildTicketSummarySelect() {
  return `SELECT
    ticket_code AS "ticketCode",
    user_id AS "userId",
    source,
    status,
    issue_summary AS "issueSummary",
    last_user_message AS "lastUserMessage",
    last_ai_message AS "lastAiMessage",
    created_at AS "createdAt",
    updated_at AS "updatedAt"
  FROM tickets`;
}

const SYSTEM_PROMPT = `You are Bitlon's AI customer support assistant. Bitlon is a cryptocurrency trading and investment platform.

Your role is to:
- Help users with questions about Bitlon's features and services
- Provide information about cryptocurrency trading basics
- Guide users through common issues (account, deposits, withdrawals, trading)
- Answer FAQs about security, verification, and platform usage
- Be friendly, professional, and security-conscious
- ONLY answer questions related to cryptocurrency, trading, and Bitlon platform
- If asked about non-crypto topics, politely redirect to crypto/Bitlon topics
- Keep responses concise (under 150 words) unless user asks for details
- Never provide financial advice or recommend specific investments
- Always remind users to do their own research (DYOR)

Key Bitlon Information:
- Website: https://bitlon.com
- Platform: Cryptocurrency trading and investment
- Focus: Secure, user-friendly crypto trading
- Support: Available 24/7 for users

Always prioritize user security and never ask for passwords, private keys, or sensitive information.`;

function getContextualSuggestions(userMessage, aiResponse) {
  const message = `${userMessage} ${aiResponse}`.toLowerCase();

  if (message.includes('deposit') || message.includes('fund')) {
    return ['How long does deposit take?', 'Minimum deposit amount?', 'Supported payment methods?', 'Is there a deposit fee?'];
  }

  if (message.includes('withdraw') || message.includes('cashout')) {
    return ['Withdrawal processing time?', 'Withdrawal limits?', 'Withdrawal fees?', 'How to verify withdrawal?'];
  }

  if (message.includes('trade') || message.includes('buy') || message.includes('sell')) {
    return ['How to place a trade?', 'What are trading fees?', 'Types of orders available?', 'Trading limits?'];
  }

  if (message.includes('security') || message.includes('2fa') || message.includes('safe')) {
    return ['How to enable 2FA?', 'Reset 2FA?', 'Is my wallet safe?', 'Bitlon security features?'];
  }

  if (message.includes('verify') || message.includes('kyc') || message.includes('identity')) {
    return ['KYC verification time?', 'Required documents?', 'Why verify account?', 'Verification failed?'];
  }

  if (message.includes('account') || message.includes('profile') || message.includes('password')) {
    return ['Reset password?', 'Update email?', 'Close account?', 'Account limits?'];
  }

  if (message.includes('fee') || message.includes('cost') || message.includes('charge')) {
    return ['All platform fees?', 'Are there hidden fees?', 'Fee discount programs?', 'Compare with other exchanges?'];
  }

  if (message.includes('coin') || message.includes('crypto') || message.includes('currency')) {
    return ['List of supported coins?', 'How to add new coin?', 'Most traded pairs?', 'Staking available?'];
  }

  return ['How to deposit funds?', 'Trading fees?', 'Enable 2FA?', 'Supported cryptocurrencies?'];
}

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, userId } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const normalizedUserId = typeof userId === 'string' && userId.trim()
      ? userId.trim()
      : `anonymous_${Date.now()}`;

    const messagesWithSystem = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

    const chatCompletion = await groq.chat.completions.create({
      messages: messagesWithSystem,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 600,
      top_p: 1,
      stream: false,
    });

    const assistantMessage = chatCompletion.choices[0].message;
    const userMessage = messages[messages.length - 1]?.content || '';
    const aiResponse = assistantMessage.content || '';
    const suggestions = getContextualSuggestions(userMessage, aiResponse);

    await saveChatMessage(normalizedUserId, userMessage, aiResponse, suggestions);

    res.json({
      message: aiResponse,
      role: assistantMessage.role,
      timestamp: new Date().toISOString(),
      suggestions,
      model: chatCompletion.model,
    });
  } catch (error) {
    console.error('Groq API Error:', error);
    res.status(500).json({
      error: 'Failed to process chat request',
      details: error.message,
    });
  }
});

app.post('/api/tickets', async (req, res) => {
  try {
    const {
      userId,
      messages,
      issueSummary,
      lastUserMessage,
      lastAiMessage,
      source,
    } = req.body;

    if (typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const history = normalizeHistory(messages);
    if (history.length === 0) {
      return res.status(400).json({ error: 'Valid conversation history is required' });
    }

    const ticketCode = generateTicketCode();

    const result = await pool.query(
      `INSERT INTO tickets (
        ticket_code,
        user_id,
        source,
        status,
        issue_summary,
        last_user_message,
        last_ai_message,
        history
      ) VALUES ($1, $2, $3, 'open', $4, $5, $6, $7)
      RETURNING ticket_code, status, created_at`,
      [
        ticketCode,
        userId.trim(),
        typeof source === 'string' && source.trim() ? source.trim() : 'unknown',
        typeof issueSummary === 'string' && issueSummary.trim() ? issueSummary.trim() : null,
        typeof lastUserMessage === 'string' && lastUserMessage.trim() ? lastUserMessage.trim() : null,
        typeof lastAiMessage === 'string' && lastAiMessage.trim() ? lastAiMessage.trim() : null,
        JSON.stringify(history),
      ]
    );

    res.status(201).json({
      ticketCode: result.rows[0].ticket_code,
      status: result.rows[0].status,
      createdAt: result.rows[0].created_at,
      message: 'Ticket created successfully',
    });
  } catch (error) {
    console.error('Ticket creation error:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

app.get('/api/tickets/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || !userId.trim()) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await pool.query(
      `${buildTicketSummarySelect()}
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 200`,
      [userId.trim()]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('User tickets load error:', error);
    res.status(500).json({ error: 'Failed to load user tickets' });
  }
});

app.get('/api/tickets/:ticketCode', async (req, res) => {
  try {
    const { ticketCode } = req.params;
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';

    if (!userId) {
      return res.status(400).json({ error: 'userId query is required' });
    }

    const ticket = await getTicketByCode(ticketCode);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (ticket.userId !== userId) {
      return res.status(403).json({ error: 'Ticket access denied' });
    }

    res.json(ticket);
  } catch (error) {
    console.error('User ticket detail error:', error);
    res.status(500).json({ error: 'Failed to load ticket detail' });
  }
});

app.post('/api/tickets/:ticketCode/messages', async (req, res) => {
  try {
    const { ticketCode } = req.params;
    const { userId, message } = req.body;
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';

    if (!normalizedUserId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!trimmedMessage) {
      return res.status(400).json({ error: 'message is required' });
    }

    const ticket = await getTicketByCode(ticketCode);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (ticket.userId !== normalizedUserId) {
      return res.status(403).json({ error: 'Ticket access denied' });
    }

    if (ticket.status === 'closed') {
      return res.status(400).json({ error: 'Ticket is closed' });
    }

    await pool.query(
      'UPDATE tickets SET last_user_message = $1, updated_at = NOW() WHERE ticket_code = $2',
      [trimmedMessage, ticketCode]
    );
    const updatedTicket = await appendTicketMessage(ticketCode, 'user', trimmedMessage);

    res.json({
      message: 'Ticket message sent',
      ticket: updatedTicket,
    });
  } catch (error) {
    console.error('User ticket message error:', error);
    res.status(500).json({ error: 'Failed to send ticket message' });
  }
});

app.get('/api/admin/chats', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM chats ORDER BY timestamp DESC LIMIT 100');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load chats' });
  }
});

app.get('/api/admin/sessions', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sessions ORDER BY last_seen DESC');
    const sessions = {};

    result.rows.forEach((row) => {
      sessions[row.user_id] = {
        userId: row.user_id,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        messageCount: row.message_count,
      };
    });

    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

app.get('/api/admin/tickets', async (_req, res) => {
  try {
    const result = await pool.query(
      `${buildTicketSummarySelect()}
      ORDER BY created_at DESC
      LIMIT 200`
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load tickets' });
  }
});

app.get('/api/admin/tickets/:ticketCode', async (req, res) => {
  try {
    const { ticketCode } = req.params;
    const ticket = await getTicketByCode(ticketCode);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(ticket);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load ticket history' });
  }
});

app.post('/api/admin/tickets/:ticketCode/reply', async (req, res) => {
  try {
    const { ticketCode } = req.params;
    const { message, adminName } = req.body;
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';

    if (!trimmedMessage) {
      return res.status(400).json({ error: 'Reply message is required' });
    }

    const ticket = await getTicketByCode(ticketCode);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (ticket.status === 'closed') {
      return res.status(400).json({ error: 'Cannot reply to a closed ticket' });
    }

    const updatedTicket = await appendTicketMessage(ticketCode, 'admin', trimmedMessage, {
      adminName: typeof adminName === 'string' && adminName.trim() ? adminName.trim() : 'Admin',
    });

    res.json({
      message: 'Reply added to ticket',
      ticket: updatedTicket,
    });
  } catch (error) {
    console.error('Ticket reply error:', error);
    res.status(500).json({ error: 'Failed to send admin reply' });
  }
});

app.post('/api/admin/tickets/:ticketCode/close', async (req, res) => {
  try {
    const { ticketCode } = req.params;
    const ticket = await getTicketByCode(ticketCode);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    await pool.query(
      "UPDATE tickets SET status = 'closed', updated_at = NOW() WHERE ticket_code = $1",
      [ticketCode]
    );

    const updatedTicket = await getTicketByCode(ticketCode);
    res.json({
      message: 'Ticket closed successfully',
      ticket: updatedTicket,
    });
  } catch (error) {
    console.error('Ticket close error:', error);
    res.status(500).json({ error: 'Failed to close ticket' });
  }
});

app.get('/api/admin/stats', async (_req, res) => {
  try {
    const chatsCount = await pool.query('SELECT COUNT(*) FROM chats');
    const sessionsCount = await pool.query('SELECT COUNT(*) FROM sessions');
    const activeToday = await pool.query('SELECT COUNT(*) FROM sessions WHERE last_seen::date = CURRENT_DATE');
    const ticketsCount = await pool.query('SELECT COUNT(*) FROM tickets');
    const openTickets = await pool.query("SELECT COUNT(*) FROM tickets WHERE status = 'open'");

    const totalMessages = parseInt(chatsCount.rows[0].count, 10);
    const totalUsers = parseInt(sessionsCount.rows[0].count, 10);

    res.json({
      totalMessages,
      totalUsers,
      activeToday: parseInt(activeToday.rows[0].count, 10),
      averageMessagesPerUser: totalUsers > 0 ? totalMessages / totalUsers : 0,
      totalTickets: parseInt(ticketsCount.rows[0].count, 10),
      openTickets: parseInt(openTickets.rows[0].count, 10),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

app.get('/api/admin/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      'SELECT * FROM chats WHERE user_id = $1 ORDER BY timestamp DESC',
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load user chats' });
  }
});

app.delete('/api/admin/chats', async (_req, res) => {
  try {
    await pool.query('DELETE FROM chats');
    await pool.query('DELETE FROM sessions');
    await pool.query('DELETE FROM tickets');

    res.json({ message: 'All chats and tickets deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete chats' });
  }
});

app.get('/api/chat', (_req, res) => {
  res.json({
    status: 'Bitlon AI Assistant is running',
    platform: 'Bitlon - Cryptocurrency Trading',
    timestamp: new Date().toISOString(),
    hasApiKey: !!process.env.GROQ_API_KEY,
    database: process.env.DATABASE_URL ? 'PostgreSQL' : 'Not Configured',
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'OK', service: 'Bitlon AI' });
});

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }

  return ips;
}

initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    const localIPs = getLocalIPs();

    console.log(`\n${'='.repeat(70)}`);
    console.log('✅ Bitlon AI Assistant Server - RUNNING');
    console.log(`${'='.repeat(70)}`);
    console.log(`📊 Database: ${process.env.DATABASE_URL ? 'PostgreSQL ✓' : 'Not configured ⚠️'}`);
    console.log(`🌐 Server: http://localhost:${PORT}`);
    console.log(`📊 Admin: http://localhost:${PORT}/admin`);

    localIPs.forEach((ip) => {
      console.log(`🔗 Network: http://${ip}:${PORT}`);
    });

    console.log(`${'='.repeat(70)}\n`);
  });
});
