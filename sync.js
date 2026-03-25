// sync.js  ─  Google Sheets → MySQL 同步
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { pool }              = require('./mysql');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1AssV5gEVuM99-BJJV2lqjoErXNqi3NLHtRG5dupFHrU';

const SHEETS = {
  customers: { gid: 29703441,   headerRowIndex: 4 },
  sales    : { gid: 1014737581, headerRowIndex: 4 },
  orders   : { gid: 1821642662, headerRowIndex: 4 },
  followup : { gid: 1192042027, headerRowIndex: 4 },
  reps     : { gid: 1387199140, headerRowIndex: 3 },
};

// ── Google Sheets 讀取（沿用原 server.js 邏輯）────────────
function loadCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    return parsed;
  }
  const p = path.join(__dirname, 'credentials.json');
  if (fs.existsSync(p)) return require(p);
  throw new Error('找不到 Google 憑證');
}

function toVal(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/,/g, '');
  return s !== '' && !Number.isNaN(Number(s)) ? Number(s) : s;
}

async function readSheet({ gid, headerRowIndex }) {
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  await doc.useServiceAccountAuth(loadCredentials());
  await doc.loadInfo();
  const sheet = doc.sheetsById[gid];
  if (!sheet) throw new Error(`找不到 gid=${gid}`);
  await sheet.loadHeaderRow(headerRowIndex);
  const rows    = await sheet.getRows();
  const headers = sheet.headerValues;
  return rows.map(row => {
    const obj = {};
    headers.forEach(h => { obj[h] = toVal(row[h]); });
    return obj;
  });
}

// ── 同步各工作表 ──────────────────────────────────────────
async function syncCustomers(rows) {
  await pool.query('DELETE FROM crm_customers');
  for (const r of rows) {
    const id = String(r['客戶ID'] ?? '').trim();
    if (!id || id === '客戶ID') continue;
    await pool.query(`
      INSERT INTO crm_customers
        (customer_no,company,contact,title,phone,email,industry,region,
         tier,satisfaction,rep,status,order_count,note,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      id,
      r['公司名稱']   ?? '',
      r['聯絡人']     ?? '',
      r['職稱']       ?? '',
      r['電話']       ?? '',
      r['Email']      ?? '',
      r['產業別'] || r['產業'] || '',
      r['地區']       ?? '',
      r['客戶等級'] || r['等級'] || '',
      r['客戶滿意度'] || r['滿意度'] || null,
      r['負責業務']   ?? '',
      r['銷售狀態'] || r['狀態'] || '',
      r['訂單數']     ?? 0,
      r['備註']       ?? '',
      r['建立日期'] || r['建立日'] || '',
      r['最後更新'] || r['更新日期'] || '',
    ]);
  }
  return rows.length;
}

async function syncSales(rows) {
  await pool.query('DELETE FROM crm_sales');
  for (const r of rows) {
    const id = String(r['銷售ID'] ?? '').trim();
    if (!id || id === '銷售ID') continue;
    await pool.query(`
      INSERT INTO crm_sales
        (sale_id,customer_id,company,status,currency,amount,
         expected_date,actual_date,rep,note,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      id,
      r['客戶ID']     ?? '',
      r['公司名稱']   ?? '',
      r['銷售狀態']   ?? '',
      r['幣別']       ?? 'TWD',
      r['預估金額'] || r['金額'] || 0,
      r['預計成交日'] ?? '',
      r['實際成交日'] ?? '',
      r['負責業務']   ?? '',
      r['備註']       ?? '',
      r['建立日'] || r['建立日期'] || '',
      r['最後更新']   ?? '',
    ]);
  }
  return rows.length;
}

async function syncOrders(rows) {
  await pool.query('DELETE FROM crm_orders');
  for (const r of rows) {
    const id = String(r['訂單ID'] ?? '').trim();
    if (!id || id === '訂單ID') continue;
    const amount = Number(r['訂單金額'] ?? r['金額'] ?? 0);
    await pool.query(`
      INSERT INTO crm_orders
        (order_id,customer_id,company,order_date,amount,tax_amount,
         currency,pay_status,pay_date,rep,note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `, [
      id,
      r['客戶ID']     ?? '',
      r['公司名稱']   ?? '',
      r['訂單日期'] || r['日期'] || '',
      amount,
      Math.round(amount * 1.05 * 100) / 100,
      r['幣別']       ?? 'TWD',
      r['付款狀態']   ?? '',
      r['回款日期']   ?? '',
      r['負責業務']   ?? '',
      r['備註']       ?? '',
    ]);
  }
  return rows.length;
}

async function syncFollowup(rows) {
  await pool.query('DELETE FROM crm_followup');
  for (const r of rows) {
    const id = String(r['跟進ID'] ?? '').trim();
    if (!id || id === '跟進ID') continue;
    await pool.query(`
      INSERT INTO crm_followup
        (follow_id,customer_id,follow_date,rep,method,content,next_date,result)
      VALUES (?,?,?,?,?,?,?,?)
    `, [
      id,
      r['客戶ID']   ?? '',
      r['跟進日期'] ?? '',
      r['跟進人員'] || r['負責業務'] || '',
      r['跟進方式'] ?? '',
      r['跟進內容'] ?? '',
      r['下次跟進'] || r['下次跟進日'] || '',
      r['跟進結果'] ?? '',
    ]);
  }
  return rows.length;
}

async function syncReps(rows) {
  await pool.query('DELETE FROM crm_reps');
  for (const r of rows) {
    const name = String(r['姓名'] ?? '').trim();
    if (!name || name === '姓名') continue;
    await pool.query(`
      INSERT INTO crm_reps (rep_id,name,email,dept,phone,status)
      VALUES (?,?,?,?,?,?)
    `, [
      r['員工ID']  ?? '',
      name,
      r['Email']  ?? '',
      r['部門']   ?? '',
      r['電話']   ?? '',
      r['狀態']   ?? 'active',
    ]);
  }
  return rows.length;
}

// ── 記錄同步結果 ──────────────────────────────────────────
async function logSync(sheetName, rowsSynced, status, message = null) {
  await pool.query(`
    INSERT INTO sync_logs (sheet_name,rows_synced,status,message)
    VALUES (?,?,?,?)
  `, [sheetName, rowsSynced, status, message]);
}

// ── 主同步函式 ────────────────────────────────────────────
const SYNC_MAP = {
  customers: syncCustomers,
  sales    : syncSales,
  orders   : syncOrders,
  followup : syncFollowup,
  reps     : syncReps,
};

async function syncAll() {
  console.log('\n🔄 開始同步 Google Sheets → MySQL...');
  const start = Date.now();
  const result = {};

  for (const [name, config] of Object.entries(SHEETS)) {
    try {
      console.log(`  讀取「${name}」...`);
      const rows  = await readSheet(config);
      const count = await SYNC_MAP[name](rows);
      await logSync(name, count, 'success');
      result[name] = { ok: true, count };
      console.log(`  ✅ ${name}: ${count} 筆`);
    } catch (err) {
      await logSync(name, 0, 'failed', err.message);
      result[name] = { ok: false, error: err.message };
      console.error(`  ❌ ${name}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ 同步完成（耗時 ${elapsed}s）\n`);
  return result;
}

// ── 定時同步 ─────────────────────────────────────────────
function startSchedule() {
  const minutes = Number(process.env.SYNC_INTERVAL_MINUTES) || 60;
  console.log(`⏰ 定時同步已啟動（每 ${minutes} 分鐘）`);
  setInterval(() => {
    syncAll().catch(err => console.error('定時同步失敗:', err.message));
  }, minutes * 60 * 1000);
}

// ── 直接執行時：立即同步一次 ──────────────────────────────
if (require.main === module) {
  syncAll()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}

module.exports = { syncAll, startSchedule };
