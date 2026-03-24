const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1AssV5gEVuM99-BJJV2lqjoErXNqi3NLHtRG5dupFHrU';
const SHEETS = {
  customers: { gid: 29703441, headerRowIndex: 4 },
  sales: { gid: 1014737581, headerRowIndex: 4 },
  orders: { gid: 1821642662, headerRowIndex: 4 },
  followup: { gid: 1192042027, headerRowIndex: 4 },
  reps: { gid: 1387199140, headerRowIndex: 3 },
};

function loadGoogleCredentials() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    const parsed = JSON.parse(rawJson);
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return parsed;
  }

  const credentialsPath = path.join(__dirname, 'credentials.json');
  if (fs.existsSync(credentialsPath)) {
    return require(credentialsPath);
  }

  throw new Error(
    'Google credentials are missing. Set GOOGLE_SERVICE_ACCOUNT_JSON or provide credentials.json locally.'
  );
}

function sanitizeGoogleError(err, gid, headerRowIndex) {
  const rawMessage = err && err.message ? err.message : String(err || 'Unknown error');
  const statusCode = err && (err.code || err.statusCode || err.response?.status);
  const details = {
    sheetGid: gid || null,
    headerRowIndex: headerRowIndex || null,
  };

  if (/oauth2|token|fetcherror/i.test(rawMessage)) {
    return {
      status: 502,
      error: 'google_auth_failed',
      message: 'Google authentication failed while requesting an access token.',
      details,
    };
  }

  if (statusCode === 403 || /permission|forbidden|access denied/i.test(rawMessage)) {
    return {
      status: 403,
      error: 'google_sheet_forbidden',
      message: 'The configured service account does not have permission to access this spreadsheet.',
      details,
    };
  }

  if (statusCode === 404 || /not found/i.test(rawMessage)) {
    return {
      status: 404,
      error: 'google_sheet_not_found',
      message: 'The spreadsheet or worksheet could not be found.',
      details,
    };
  }

  if (/header row|header cells are blank/i.test(rawMessage)) {
    return {
      status: 500,
      error: 'google_sheet_header_missing',
      message: 'The worksheet header row is blank or not located at the configured row.',
      details,
    };
  }

  return {
    status: 500,
    error: 'google_sheet_read_failed',
    message: 'Failed to read data from Google Sheets.',
    details,
  };
}

function toSheetValue(value) {
  if (typeof value === 'number') {
    return value;
  }

  const stringValue = String(value ?? '').trim();
  const normalized = stringValue.replace(/,/g, '');
  return normalized !== '' && !Number.isNaN(Number(normalized)) ? Number(normalized) : stringValue;
}

async function getSheetData({ gid, headerRowIndex = 1 }) {
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  const creds = loadGoogleCredentials();

  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();

  const sheet = doc.sheetsById[gid];
  if (!sheet) {
    throw new Error(`Worksheet not found for gid=${gid}`);
  }

  await sheet.loadHeaderRow(headerRowIndex);
  const rows = await sheet.getRows();
  const headers = sheet.headerValues;

  return rows.map((row) => {
    const result = {};
    headers.forEach((header) => {
      result[header] = toSheetValue(row[header]);
    });
    return result;
  });
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/all', async (req, res) => {
  try {
    console.log('\nLoading all worksheets...');
    const [customers, sales, orders, followup, reps] = await Promise.all([
      getSheetData(SHEETS.customers),
      getSheetData(SHEETS.sales),
      getSheetData(SHEETS.orders),
      getSheetData(SHEETS.followup),
      getSheetData(SHEETS.reps),
    ]);

    console.log(
      `Loaded customers=${customers.length}, sales=${sales.length}, orders=${orders.length}, followup=${followup.length}, reps=${reps.length}`
    );

    res.json({ customers, sales, orders, followup, reps });
  } catch (err) {
    const payload = sanitizeGoogleError(err);
    console.error('Failed to load all worksheets:', err && err.message ? err.message : err);
    res.status(payload.status).json(payload);
  }
});

Object.entries(SHEETS).forEach(([name, config]) => {
  app.get(`/api/${name}`, async (req, res) => {
    try {
      const data = await getSheetData(config);
      res.json(data);
    } catch (err) {
      const payload = sanitizeGoogleError(err, config.gid, config.headerRowIndex);
      console.error(`Failed to load worksheet ${name} (${config.gid}):`, err && err.message ? err.message : err);
      res.status(payload.status).json(payload);
    }
  });
});

app.listen(PORT, () => {
  console.log('\n================================');
  console.log('CRM Dashboard server started');
  console.log('================================');
  console.log('Dashboard: http://localhost:' + PORT);
  console.log('API:       http://localhost:' + PORT + '/api/health');
  console.log('');
});
