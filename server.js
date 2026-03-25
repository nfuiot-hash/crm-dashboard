require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { testConnection } = require('./mysql');
const { requireAdmin } = require('./auth');
const { syncAll, startSchedule } = require('./sync');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SYNC_COOLDOWN_MS = Number(process.env.SYNC_COOLDOWN_MS) || 15000;
let syncInFlight = null;
let lastSyncAt = 0;

app.use(cors());
app.use(express.json());
app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets')));
app.use(express.static(PUBLIC_DIR, { index: false }));

function findPage(...relativePaths) {
  for (const relativePath of relativePaths) {
    const fullPath = path.join(__dirname, relativePath);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

function sendPage(res, ...relativePaths) {
  const pagePath = findPage(...relativePaths);
  if (!pagePath) {
    return res.status(404).send('Page not found');
  }
  return res.sendFile(pagePath);
}

app.get('/login.html', (req, res) => sendPage(res, 'login.html', 'public/login.html'));
app.get('/admin.html', (req, res) => sendPage(res, 'admin.html', 'public/admin.html'));

app.use('/api/auth', require('./authRoutes'));
app.use('/api/admin', require('./adminRoutes'));
app.use('/api', require('./crmRoutes'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), version: '2.0' });
});

async function runSync(triggerLabel) {
  if (syncInFlight) {
    return syncInFlight;
  }

  const now = Date.now();
  if (now - lastSyncAt < SYNC_COOLDOWN_MS) {
    return {
      ok: true,
      skipped: true,
      cooldownMs: SYNC_COOLDOWN_MS,
      elapsedMs: now - lastSyncAt,
    };
  }

  syncInFlight = (async () => {
    try {
      console.log(`Sync triggered by ${triggerLabel}`);
      const result = await syncAll();
      lastSyncAt = Date.now();
      return { ok: true, skipped: false, result };
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

app.post('/api/sync-now', require('./auth').requireAuth, async (req, res) => {
  try {
    const result = await runSync(`${req.user.username} (user)`);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'sync_failed', message: err.message });
  }
});

app.post('/api/admin/sync-now', requireAdmin, async (req, res) => {
  try {
    const result = await runSync(`${req.user.username} (admin)`);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: 'sync_failed', message: err.message });
  }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'not_found' });
  }
  return sendPage(res, 'index.html', 'public/index.html');
});

async function start() {
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('Unable to connect to MySQL. Check your database settings and run npm run init-db if needed.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log('\n================================');
    console.log('  CRM Dashboard v2.0 started');
    console.log('================================');
    console.log(`  Dashboard: http://localhost:${PORT}`);
    console.log(`  Login:     http://localhost:${PORT}/login.html`);
    console.log(`  Admin:     http://localhost:${PORT}/admin.html`);
    console.log(`  API:       http://localhost:${PORT}/api/health`);
    console.log('');
  });

  syncAll().catch((err) => console.error('Initial sync failed:', err.message));
  startSchedule();
}

start();
