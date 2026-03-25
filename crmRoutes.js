// routes/crmRoutes.js
const express  = require('express');
const router   = express.Router();
const crm      = require('./crmModel');
const { requireAuth } = require('./auth');

// 所有路由都需要登入
router.use(requireAuth);

// GET /api/all  ─  取得全部資料（對應原始 index.html 的 /api/all）
router.get('/all', async (req, res) => {
  try {
    const data = await crm.getAll();
    res.json(data);
  } catch (err) {
    console.error('getAll error:', err.message);
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

// GET /api/:sheet  ─  取得單一工作表
router.get('/:sheet', async (req, res) => {
  const name = req.params.sheet;
  const allowed = ['customers','sales','orders','followup','reps'];
  if (!allowed.includes(name)) {
    return res.status(404).json({ error: 'not_found', message: `找不到資料表 ${name}` });
  }
  try {
    const data = await crm.getSheet(name);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

// GET /api/kpi/reps  ─  業務員 KPI
router.get('/kpi/reps', async (req, res) => {
  try {
    res.json(await crm.getRepKPI());
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

// GET /api/kpi/monthly  ─  月度趨勢
router.get('/kpi/monthly', async (req, res) => {
  try {
    res.json(await crm.getMonthlyTrend(Number(req.query.months) || 12));
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

// GET /api/kpi/regions  ─  地區分析
router.get('/kpi/regions', async (req, res) => {
  try {
    res.json(await crm.getRegionStats());
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

// GET /api/kpi/churn  ─  流失預警
router.get('/kpi/churn', async (req, res) => {
  try {
    res.json(await crm.getChurnRisk(Number(req.query.days) || 30));
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

module.exports = router;
