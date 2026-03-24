const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SPREADSHEET_ID = '1AssV5gEVuM99-BJJV2lqjoErXNqi3NLHtRG5dupFHrU';
const SERVICE_ACCOUNT_EMAIL = 'id-390@marine-actor-491206-s4.iam.gserviceaccount.com';
const SHEETS = {
  customers: { gid: 29703441, headerRowIndex: 4 },
  sales: { gid: 1014737581, headerRowIndex: 4 },
  orders: { gid: 1821642662, headerRowIndex: 4 },
  followup: { gid: 1192042027, headerRowIndex: 4 },
  reps: { gid: 1387199140, headerRowIndex: 3 },
};

function buildGoogleSheetsError(err, gid, headerRowIndex) {
  const rawMessage = err && err.message ? err.message : String(err || 'Unknown error');
  const statusCode = err && (err.code || err.statusCode || err.response?.status);
  const details = {
    spreadsheetId: SPREADSHEET_ID,
    sheetGid: gid || null,
    headerRowIndex: headerRowIndex || null,
    serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
    rawMessage,
  };

  if (/oauth2|token|fetcherror/i.test(rawMessage)) {
    return {
      status: 502,
      error: 'google_auth_failed',
      message: 'Google authentication failed while requesting an access token.',
      details: {
        ...details,
        hint: 'Check internet access to googleapis.com and verify credentials.json is valid.',
      },
    };
  }

  if (statusCode === 403 || /permission|forbidden|access denied/i.test(rawMessage)) {
    return {
      status: 403,
      error: 'google_sheet_forbidden',
      message: 'The service account does not have permission to access this spreadsheet.',
      details: {
        ...details,
        hint: 'Share the spreadsheet with the service account email as Viewer or Editor.',
      },
    };
  }

  if (statusCode === 404 || /not found/i.test(rawMessage)) {
    return {
      status: 404,
      error: 'google_sheet_not_found',
      message: 'The spreadsheet or worksheet could not be found.',
      details: {
        ...details,
        hint: 'Check the spreadsheet ID and worksheet gid values in server.js.',
      },
    };
  }

  if (/header row|header cells are blank/i.test(rawMessage)) {
    return {
      status: 500,
      error: 'google_sheet_header_missing',
      message: 'The worksheet header row is blank or not located at the configured row.',
      details: {
        ...details,
        hint: 'Move your column names to the configured header row, or update headerRowIndex in server.js.',
      },
    };
  }

  return {
    status: 500,
    error: 'google_sheet_read_failed',
    message: 'Failed to read data from Google Sheets.',
    details: {
      ...details,
      hint: 'Review the raw error message to identify the failing Google Sheets step.',
    },
  };
}

async function getSheetData({ gid, headerRowIndex = 1 }) {
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  const creds = require('./credentials.json');

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
    const obj = {};
    headers.forEach((header) => {
      const value = row[header] || '';
      const normalized = typeof value === 'string' ? value.replace(/,/g, '').trim() : value;
      obj[header] = !isNaN(normalized) && normalized !== '' ? Number(normalized) : value;
    });
    return obj;
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
    const payload = buildGoogleSheetsError(err);
    console.error('Failed to load all worksheets:', payload.details.rawMessage);
    res.status(payload.status).json(payload);
  }
});

Object.entries(SHEETS).forEach(([name, config]) => {
  app.get(`/api/${name}`, async (req, res) => {
    try {
      const data = await getSheetData(config);
      res.json(data);
    } catch (err) {
      const payload = buildGoogleSheetsError(err, config.gid, config.headerRowIndex);
      console.error(`Failed to load worksheet ${name} (${config.gid}):`, payload.details.rawMessage);
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
