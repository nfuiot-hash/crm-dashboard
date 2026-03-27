const express = require('express');
const { requireAuth } = require('./auth');
const quotation = require('./quotationModel');

const router = express.Router();

router.use(requireAuth);

router.get('/dashboard', async (req, res) => {
  try {
    const result = await quotation.getQuotationDashboard();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'quotation_dashboard_failed', message: error.message });
  }
});

router.get('/sheets', async (req, res) => {
  try {
    const result = await quotation.getQuotationSheets();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'quotation_sheets_failed', message: error.message });
  }
});

router.get('/sheets/:sheet', async (req, res) => {
  try {
    const result = await quotation.getQuotationSheets();
    const key = req.params.sheet;
    const data = result[key] || result.raw?.[key];
    if (!data) {
      return res.status(404).json({ error: 'sheet_not_found' });
    }
    return res.json({ key, data });
  } catch (error) {
    res.status(500).json({ error: 'quotation_sheet_failed', message: error.message });
  }
});

module.exports = router;
