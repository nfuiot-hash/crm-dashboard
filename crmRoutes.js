const express = require('express');
const router = express.Router();
const crm = require('./crmModel');
const { requireAuth } = require('./auth');

router.use(requireAuth);

router.get('/all', async (req, res) => {
  try {
    res.json(await crm.getAll());
  } catch (err) {
    console.error('getAll error:', err.message);
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

router.get('/kpi/dashboard', async (req, res) => {
  try {
    res.json(await crm.getDashboardKPI());
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

router.get('/kpi/reps', async (req, res) => {
  try {
    res.json(await crm.getRepWinRate());
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

router.get('/kpi/monthly', async (req, res) => {
  try {
    res.json(await crm.getMonthlyRevenueTrend(Number(req.query.months) || 12));
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

router.get('/kpi/matrix', async (req, res) => {
  try {
    res.json(await crm.getTierRegionMatrix());
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

router.get('/kpi/churn', async (req, res) => {
  try {
    res.json(await crm.getChurnAlerts(Number(req.query.days) || 30));
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

router.get('/kpi/funnel', async (req, res) => {
  try {
    res.json(await crm.getSalesFunnel());
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

router.get('/:sheet', async (req, res) => {
  const name = req.params.sheet;
  const allowed = ['customers', 'sales', 'orders', 'followup', 'reps'];
  if (!allowed.includes(name)) {
    return res.status(404).json({ error: 'not_found', message: `Unknown sheet: ${name}` });
  }
  try {
    res.json(await crm.getSheet(name));
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

module.exports = router;
