const express = require('express');
const router = express.Router();
const { requireAuth } = require('./auth');
const inventory = require('./inventoryModel');

router.use(requireAuth);

router.get('/dashboard', async (req, res) => {
  try {
    res.json(await inventory.getInventoryDashboard());
  } catch (err) {
    console.error('inventory dashboard error:', err.message);
    res.status(500).json({ error: 'inventory_error', message: err.message });
  }
});

router.get('/sheets', async (req, res) => {
  try {
    res.json(await inventory.getInventorySheets());
  } catch (err) {
    res.status(500).json({ error: 'inventory_error', message: err.message });
  }
});

router.get('/sheets/:sheet', async (req, res) => {
  const allSheets = await inventory.getInventorySheets().catch((err) => {
    res.status(500).json({ error: 'inventory_error', message: err.message });
    return null;
  });

  if (!allSheets) return;

  const key = req.params.sheet;
  if (!(key in allSheets)) {
    return res.status(404).json({ error: 'not_found', message: `Unknown inventory sheet: ${key}` });
  }

  res.json(allSheets[key]);
});

module.exports = router;
