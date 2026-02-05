
// require('dotenv').config();
// const express = require('express');
// const Groq = require('groq-sdk');
// const os = require('os');
// const fs = require('fs').promises;
// const path = require('path');

// const app = express();
// const PORT = process.env.PORT || 3000;

// const groq = new Groq({
//   apiKey: process.env.GROQ_API_KEY,
// });

// app.use(express.json());

// // CORS
// app.use((req, res, next) => {
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
//   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//   if (req.method === 'OPTIONS') {
//     return res.sendStatus(200);
//   }
//   next();
// });

// // Create data directory
// const DATA_DIR = path.join(__dirname, 'chat_data');
// const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
// const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// async function initializeDataFiles() {
//   try {
//     await fs.mkdir(DATA_DIR, { recursive: true });
    
//     try {
//       await fs.access(CHATS_FILE);
//     } catch {
//       await fs.writeFile(CHATS_FILE, JSON.stringify([]), 'utf8');
//     }
    
//     try {
//       await fs.access(SESSIONS_FILE);
//     } catch {
//       await fs.writeFile(SESSIONS_FILE, JSON.stringify({}), 'utf8');
//     }
//   } catch (error) {
//     console.error('Error initializing data files:', error);
//   }
// }

// // Save chat message
// async function saveChatMessage(userId, userMessage, aiResponse, suggestions) {
//   try {
//     const data = await fs.readFile(CHATS_FILE, 'utf8');
//     const chats = JSON.parse(data);
    
//     const chatEntry = {
//       id: Date.now().toString(),
//       userId,
//       timestamp: new Date().toISOString(),
//       userMessage,
//       aiResponse,
//       suggestions,
//     };
    
//     chats.push(chatEntry);
//     await fs.writeFile(CHATS_FILE, JSON.stringify(chats, null, 2), 'utf8');
    
//     await updateSessionInfo(userId);
//   } catch (error) {
//     console.error('Error saving chat:', error);
//   }
// }

// // Update session info
// async function updateSessionInfo(userId) {
//   try {
//     const data = await fs.readFile(SESSIONS_FILE, 'utf8');
//     const sessions = JSON.parse(data);
    
//     if (!sessions[userId]) {
//       sessions[userId] = {
//         userId,
//         firstSeen: new Date().toISOString(),
//         messageCount: 0,
//       };
//     }
    
//     sessions[userId].lastSeen = new Date().toISOString();
//     sessions[userId].messageCount += 1;
    
//     await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
//   } catch (error) {
//     console.error('Error updating session:', error);
//   }
// }

// const SYSTEM_PROMPT = `You are Bitlon's AI customer support assistant. Bitlon is a cryptocurrency trading and investment platform.

// Your role is to:
// - Help users with questions about Bitlon's features and services
// - Provide information about cryptocurrency trading basics
// - Guide users through common issues (account, deposits, withdrawals, trading)
// - Answer FAQs about security, verification, and platform usage
// - Be friendly, professional, and security-conscious
// - ONLY answer questions related to cryptocurrency, trading, and Bitlon platform
// - If asked about non-crypto topics, politely redirect to 0/Bitlon topics
// - Keep responses concise (under 150 words) unless user asks for details
// - Never provide financial advice or recommend specific investments
// - Always remind users to do their own research (DYOR)

// Key Bitlon Information:
// - Website: https://bitlon.com
// - Platform: Cryptocurrency trading and investment
// - Focus: Secure, user-friendly crypto trading
// - Support: Available 24/7 for users

// Always prioritize user security and never ask for passwords, private keys, or sensitive information.`;

// const getContextualSuggestions = (userMessage, aiResponse) => {
//   const message = (userMessage + ' ' + aiResponse).toLowerCase();
  
//   if (message.includes('deposit') || message.includes('fund')) {
//     return [
//       "How long does deposit take?",
//       "Minimum deposit amount?",
//       "Supported payment methods?",
//       "Is there a deposit fee?"
//     ];
//   }
  
//   if (message.includes('withdraw') || message.includes('cashout')) {
//     return [
//       "Withdrawal processing time?",
//       "Withdrawal limits?",
//       "Withdrawal fees?",
//       "How to verify withdrawal?"
//     ];
//   }
  
//   if (message.includes('trade') || message.includes('buy') || message.includes('sell')) {
//     return [
//       "How to place a trade?",
//       "What are trading fees?",
//       "Types of orders available?",
//       "Trading limits?"
//     ];
//   }
  
//   if (message.includes('security') || message.includes('2fa') || message.includes('safe')) {
//     return [
//       "How to enable 2FA?",
//       "Reset 2FA?",
//       "Is my wallet safe?",
//       "Bitlon security features?"
//     ];
//   }
  
//   if (message.includes('verify') || message.includes('kyc') || message.includes('identity')) {
//     return [
//       "KYC verification time?",
//       "Required documents?",
//       "Why verify account?",
//       "Verification failed?"
//     ];
//   }
  
//   if (message.includes('account') || message.includes('profile') || message.includes('password')) {
//     return [
//       "Reset password?",
//       "Update email?",
//       "Close account?",
//       "Account limits?"
//     ];
//   }
  
//   if (message.includes('fee') || message.includes('cost') || message.includes('charge')) {
//     return [
//       "All platform fees?",
//       "Are there hidden fees?",
//       "Fee discount programs?",
//       "Compare with other exchanges?"
//     ];
//   }
  
//   if (message.includes('coin') || message.includes('crypto') || message.includes('currency')) {
//     return [
//       "List of supported coins?",
//       "How to add new coin?",
//       "Most traded pairs?",
//       "Staking available?"
//     ];
//   }
  
//   return [
//     "How to deposit funds?",
//     "Trading fees?",
//     "Enable 2FA?",
//     "Supported cryptocurrencies?"
//   ];
// };

// // Chat endpoint
// app.post('/api/chat', async (req, res) => {
//   try {
//     const { messages, userId } = req.body;

//     if (!messages || !Array.isArray(messages)) {
//       return res.status(400).json({ error: 'Messages array is required' });
//     }

//     const messagesWithSystem = [
//       { role: 'system', content: SYSTEM_PROMPT },
//       ...messages,
//     ];

//     const chatCompletion = await groq.chat.completions.create({
//       messages: messagesWithSystem,
//       model: 'llama-3.3-70b-versatile',
//       temperature: 0.7,
//       max_tokens: 600,
//       top_p: 1,
//       stream: false,
//     });

//     const assistantMessage = chatCompletion.choices[0].message;
//     const userMessage = messages[messages.length - 1]?.content || '';
    
//     const suggestions = getContextualSuggestions(userMessage, assistantMessage.content);

//     // Save to database
//     await saveChatMessage(userId, userMessage, assistantMessage.content, suggestions);

//     res.json({
//       message: assistantMessage.content,
//       role: assistantMessage.role,
//       timestamp: new Date().toISOString(),
//       suggestions: suggestions,
//       model: chatCompletion.model,
//     });
//   } catch (error) {
//     console.error('Groq API Error:', error);
//     res.status(500).json({ 
//       error: 'Failed to process chat request',
//       details: error.message 
//     });
//   }
// });

// // Admin endpoints
// app.get('/api/admin/chats', async (req, res) => {
//   try {
//     const data = await fs.readFile(CHATS_FILE, 'utf8');
//     const chats = JSON.parse(data);
//     res.json(chats);
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to load chats' });
//   }
// });

// app.get('/api/admin/sessions', async (req, res) => {
//   try {
//     const data = await fs.readFile(SESSIONS_FILE, 'utf8');
//     const sessions = JSON.parse(data);
//     res.json(sessions);
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to load sessions' });
//   }
// });

// app.get('/api/admin/stats', async (req, res) => {
//   try {
//     const chatsData = await fs.readFile(CHATS_FILE, 'utf8');
//     const chats = JSON.parse(chatsData);
    
//     const sessionsData = await fs.readFile(SESSIONS_FILE, 'utf8');
//     const sessions = JSON.parse(sessionsData);
    
//     const stats = {
//       totalMessages: chats.length,
//       totalUsers: Object.keys(sessions).length,
//       activeToday: Object.values(sessions).filter(s => {
//         const lastSeen = new Date(s.lastSeen);
//         const today = new Date();
//         return lastSeen.toDateString() === today.toDateString();
//       }).length,
//       averageMessagesPerUser: chats.length / Object.keys(sessions).length || 0,
//     };
    
//     res.json(stats);
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to load stats' });
//   }
// });

// app.get('/api/admin/user/:userId', async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const data = await fs.readFile(CHATS_FILE, 'utf8');
//     const chats = JSON.parse(data);
    
//     const userChats = chats.filter(chat => chat.userId === userId);
//     res.json(userChats);
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to load user chats' });
//   }
// });

// app.delete('/api/admin/chats', async (req, res) => {
//   try {
//     await fs.writeFile(CHATS_FILE, JSON.stringify([]), 'utf8');
//     await fs.writeFile(SESSIONS_FILE, JSON.stringify({}), 'utf8');
//     res.json({ message: 'All chats deleted' });
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to delete chats' });
//   }
// });

// app.get('/api/chat', (req, res) => {
//   res.json({ 
//     status: 'Bitlon AI Assistant is running',
//     platform: 'Bitlon - Cryptocurrency Trading',
//     timestamp: new Date().toISOString(),
//     hasApiKey: !!process.env.GROQ_API_KEY,
//   });
// });

// app.get('/health', (req, res) => {
//   res.json({ status: 'OK', service: 'Bitlon AI' });
// });

// // Serve admin dashboard
// app.use('/admin', express.static(path.join(__dirname, 'admin')));

// function getLocalIPs() {
//   const interfaces = os.networkInterfaces();
//   const ips = [];
  
//   for (const name of Object.keys(interfaces)) {
//     for (const iface of interfaces[name]) {
//       if (iface.family === 'IPv4' && !iface.internal) {
//         ips.push(iface.address);
//       }
//     }
//   }
  
//   return ips;
// }

// // Initialize and start
// initializeDataFiles().then(() => {
//   app.listen(PORT, '0.0.0.0', () => {
//     const localIPs = getLocalIPs();
    
//     console.log(`\n${'='.repeat(70)}`);
//     console.log(`✅ Bitlon AI Assistant Server - RUNNING`);
//     console.log(`${'='.repeat(70)}`);
    
//     console.log(`\n📊 Admin Dashboard:`);
//     console.log(`   Local:    http://localhost:${PORT}/admin`);
//     localIPs.forEach(ip => {
//       console.log(`   Network:  http://${ip}:${PORT}/admin`);
//     });
    
//     console.log(`\n🌐 API URLs:`);
//     console.log(`   Local:    http://localhost:${PORT}`);
//     localIPs.forEach(ip => {
//       console.log(`   Network:  http://${ip}:${PORT}`);
//     });
    
//     console.log(`\n✅ Status: Ready`);
//     console.log(`📁 Data: ${DATA_DIR}`);
//     console.log(`${'='.repeat(70)}\n`);
//   });
// });

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

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve admin dashboard
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Initialize database tables
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

    console.log('✅ Database initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

// Save chat message
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

// Update session info
async function updateSessionInfo(userId) {
  try {
    const result = await pool.query(
      'SELECT * FROM sessions WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      await pool.query(
        'INSERT INTO sessions (user_id, message_count) VALUES ($1, 1)',
        [userId]
      );
    } else {
      await pool.query(
        'UPDATE sessions SET last_seen = NOW(), message_count = message_count + 1 WHERE user_id = $1',
        [userId]
      );
    }
  } catch (error) {
    console.error('Error updating session:', error);
  }
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

const getContextualSuggestions = (userMessage, aiResponse) => {
  const message = (userMessage + ' ' + aiResponse).toLowerCase();
  
  if (message.includes('deposit') || message.includes('fund')) {
    return ["How long does deposit take?", "Minimum deposit amount?", "Supported payment methods?", "Is there a deposit fee?"];
  }
  
  if (message.includes('withdraw') || message.includes('cashout')) {
    return ["Withdrawal processing time?", "Withdrawal limits?", "Withdrawal fees?", "How to verify withdrawal?"];
  }
  
  if (message.includes('trade') || message.includes('buy') || message.includes('sell')) {
    return ["How to place a trade?", "What are trading fees?", "Types of orders available?", "Trading limits?"];
  }
  
  if (message.includes('security') || message.includes('2fa') || message.includes('safe')) {
    return ["How to enable 2FA?", "Reset 2FA?", "Is my wallet safe?", "Bitlon security features?"];
  }
  
  if (message.includes('verify') || message.includes('kyc') || message.includes('identity')) {
    return ["KYC verification time?", "Required documents?", "Why verify account?", "Verification failed?"];
  }
  
  if (message.includes('account') || message.includes('profile') || message.includes('password')) {
    return ["Reset password?", "Update email?", "Close account?", "Account limits?"];
  }
  
  if (message.includes('fee') || message.includes('cost') || message.includes('charge')) {
    return ["All platform fees?", "Are there hidden fees?", "Fee discount programs?", "Compare with other exchanges?"];
  }
  
  if (message.includes('coin') || message.includes('crypto') || message.includes('currency')) {
    return ["List of supported coins?", "How to add new coin?", "Most traded pairs?", "Staking available?"];
  }
  
  return ["How to deposit funds?", "Trading fees?", "Enable 2FA?", "Supported cryptocurrencies?"];
};

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, userId } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const messagesWithSystem = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

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
    const suggestions = getContextualSuggestions(userMessage, assistantMessage.content);

    await saveChatMessage(userId, userMessage, assistantMessage.content, suggestions);

    res.json({
      message: assistantMessage.content,
      role: assistantMessage.role,
      timestamp: new Date().toISOString(),
      suggestions: suggestions,
      model: chatCompletion.model,
    });
  } catch (error) {
    console.error('Groq API Error:', error);
    res.status(500).json({ 
      error: 'Failed to process chat request',
      details: error.message 
    });
  }
});

// Admin endpoints
app.get('/api/admin/chats', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM chats ORDER BY timestamp DESC LIMIT 100');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load chats' });
  }
});

app.get('/api/admin/sessions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sessions ORDER BY last_seen DESC');
    const sessions = {};
    result.rows.forEach(row => {
      sessions[row.user_id] = {
        userId: row.user_id,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        messageCount: row.message_count
      };
    });
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const chatsCount = await pool.query('SELECT COUNT(*) FROM chats');
    const sessionsCount = await pool.query('SELECT COUNT(*) FROM sessions');
    const activeToday = await pool.query(
      "SELECT COUNT(*) FROM sessions WHERE last_seen::date = CURRENT_DATE"
    );
    
    const totalMessages = parseInt(chatsCount.rows[0].count);
    const totalUsers = parseInt(sessionsCount.rows[0].count);
    
    res.json({
      totalMessages,
      totalUsers,
      activeToday: parseInt(activeToday.rows[0].count),
      averageMessagesPerUser: totalUsers > 0 ? totalMessages / totalUsers : 0,
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

app.delete('/api/admin/chats', async (req, res) => {
  try {
    await pool.query('DELETE FROM chats');
    await pool.query('DELETE FROM sessions');
    res.json({ message: 'All chats deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete chats' });
  }
});

app.get('/api/chat', (req, res) => {
  res.json({ 
    status: 'Bitlon AI Assistant is running',
    platform: 'Bitlon - Cryptocurrency Trading',
    timestamp: new Date().toISOString(),
    hasApiKey: !!process.env.GROQ_API_KEY,
    database: process.env.DATABASE_URL ? 'PostgreSQL' : 'In-Memory'
  });
});

app.get('/health', (req, res) => {
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

// Initialize and start
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    const localIPs = getLocalIPs();
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ Bitlon AI Assistant Server - RUNNING`);
    console.log(`${'='.repeat(70)}`);
    console.log(`📊 Database: ${process.env.DATABASE_URL ? 'PostgreSQL ✓' : 'In-Memory ⚠️'}`);
    console.log(`🌐 Server: http://localhost:${PORT}`);
    console.log(`📊 Admin: http://localhost:${PORT}/admin`);
    console.log(`${'='.repeat(70)}\n`);
  });
});