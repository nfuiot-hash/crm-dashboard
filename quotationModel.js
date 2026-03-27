require('dotenv').config();
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const QUOTATION_SPREADSHEET_ID = '1sdW1uLqMcBQfiIAiuYY8mvvnGdcyFciyTVdN5tIA1Kk';
const GRID_RANGE = 'A1:N80';

const QUOTATION_SHEETS = {
  process_analysis: { title: '製程分析', gid: 194646972 },
  cost_settings: { title: '報價成本設定', gid: 1143419326 },
  break_even: { title: '損益平衡分析', gid: 1240752493 },
  quotation_analysis: { title: '報價分析', gid: 1091732840 },
  quotation_form: { title: '報價投標單', gid: 991614919 },
  history_stats: { title: '歷史統計', gid: 1657228733 },
  margin_settings: { title: '毛利率設定', gid: 1329101690 },
};

function loadCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    return parsed;
  }
  return require(path.join(__dirname, 'credentials.json'));
}

function normalize(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const numeric = Number(text.replace(/,/g, ''));
  return Number.isFinite(numeric) ? numeric : text;
}

function gridToRows(sheet, rows, cols) {
  const matrix = [];
  for (let row = 0; row < rows; row += 1) {
    const values = [];
    for (let col = 0; col < cols; col += 1) {
      const cell = sheet.getCell(row, col);
      values.push(normalize(cell.value));
    }
    matrix.push(values);
  }
  return matrix;
}

function rowHasValues(row) {
  return row.some((value) => String(value ?? '').trim() !== '');
}

function isHeaderMatch(row, headers) {
  return headers.every((header, index) => String(row[index] ?? '').trim() === header);
}

function readTable(rows, headers, startIndex) {
  const result = [];
  for (let i = startIndex; i < rows.length; i += 1) {
    const row = rows[i];
    const first = String(row[0] ?? '').trim();
    if (!first) break;
    if (i !== startIndex && headers.some((header, idx) => String(row[idx] ?? '').trim() === header)) break;
    const mapped = {};
    headers.forEach((header, idx) => {
      mapped[header] = row[idx] ?? '';
    });
    result.push(mapped);
  }
  return result;
}

function findTable(rows, headers) {
  for (let i = 0; i < rows.length; i += 1) {
    if (isHeaderMatch(rows[i], headers)) {
      return readTable(rows, headers, i + 1);
    }
  }
  return [];
}

function extractKeyValueRows(rows, firstLabel, lastLabel) {
  const result = {};
  let collecting = false;
  for (const row of rows) {
    const key = String(row[0] ?? '').trim();
    const value = row[1] ?? '';
    if (key === firstLabel) collecting = true;
    if (!collecting) continue;
    if (key) result[key] = value;
    if (key === lastLabel) break;
  }
  return result;
}

function parseQuotationForm(rows) {
  const items = findTable(rows, ['項次', '產品名稱/規格', '圖號/料號', '單位', '數量', '單價(TWD)', '小計(TWD)', '備註']);
  const totals = {
    subtotal: '',
    tax: '',
    grandTotal: '',
  };

  rows.forEach((row) => {
    const label = String(row[0] ?? '').trim();
    if (label === '小計') totals.subtotal = row[6] ?? '';
    if (label === '稅額(5%)') totals.tax = row[6] ?? '';
    if (label === '總計(含稅)') totals.grandTotal = row[6] ?? '';
  });

  return {
    meta: {
      quotationNo: rows[3]?.[1] ?? '',
      quotationDate: rows[3]?.[5] ?? '',
      customerName: rows[4]?.[1] ?? '',
      validUntil: rows[4]?.[5] ?? '',
      contact: rows[5]?.[1] ?? '',
      paymentTerms: rows[5]?.[5] ?? '',
    },
    items,
    totals,
  };
}

function parseQuotationAnalysis(rows) {
  return {
    quotations: findTable(rows, ['報價單號', '客戶名稱', '訂單數量', '售價/件', '訂單成本/件', '毛利/件', '毛利率', '報價狀態']),
    costBreakdown: findTable(rows, ['分析ID', '報價單號', '成本類別', '成本金額', '佔比', '毛利貢獻', '分析標記', '備註']),
  };
}

function parseCostSettings(rows) {
  return {
    basicInfo: findTable(rows, ['報價單號', '客戶編號', '客戶名稱', '產品名稱', '圖號', '報價日期', '報價人員', '報價狀態']),
    costItems: findTable(rows, ['成本項目ID', '報價單號', '成本類別', '成本項目名稱', '單位', '數量', '單價(TWD)', '小計(TWD)']),
  };
}

function parseProcessAnalysis(rows) {
  return {
    basicInfo: findTable(rows, ['分析ID', '報價單號', '客戶編號', '客戶名稱', '產品名稱', '圖號/料號', '分析日期', 'AI分析狀態', '分析人員', '備註']),
    materials: findTable(rows, ['物料序號', '分析ID', '物料名稱', '材質', '規格尺寸', '毛坯尺寸', '單件重量(kg)', '材料單價', '損耗率(%)', '備註']),
    processSteps: findTable(rows, ['製程序號', '分析ID', '製程工序', '製程類別', '設備類型', '預估工時(分)', '是否外包', '外包商', '加工精度等級', '備註']),
  };
}

function parseHistoryStats(rows) {
  return {
    quotationHistory: findTable(rows, ['記錄ID', '報價單號', '客戶名稱', '產品名稱', '報價日期', '訂單數量', '成交價/件', '成交金額', '毛利率', '最終狀態']),
    materialHistory: findTable(rows, ['記錄ID', '採購清單號', '物料名稱', '材質', '規格', '報價日期', '供應商', '單價(TWD/kg)', '漲跌幅', '備註']),
  };
}

function parseMarginSettings(rows) {
  return {
    targets: findTable(rows, ['設定ID', '適用訂單類別', '目標毛利率(%)', '最低毛利率(%)', '預警毛利率(%)', '說明']),
  };
}

function parseBreakEven(rows) {
  const values = extractKeyValueRows(rows, '單件變動成本（含廢品）', '訂單預估損益');
  return {
    quotationNo: rows[2]?.[1] ?? '',
    orderQuantity: rows[3]?.[1] ?? '',
    unitPrice: rows[4]?.[1] ?? '',
    unitCost: rows[5]?.[1] ?? '',
    monthlyFixedCost: rows[6]?.[1] ?? '',
    targetMargin: rows[7]?.[1] ?? '',
    commissionRate: rows[8]?.[1] ?? '',
    scrapRate: rows[9]?.[1] ?? '',
    metrics: values,
  };
}

async function loadRawSheet(sheet) {
  await sheet.loadCells(GRID_RANGE);
  return gridToRows(sheet, 80, 14).filter(rowHasValues);
}

async function getQuotationSheets() {
  const doc = new GoogleSpreadsheet(QUOTATION_SPREADSHEET_ID);
  await doc.useServiceAccountAuth(loadCredentials());
  await doc.loadInfo();

  const raw = {};
  for (const [key, config] of Object.entries(QUOTATION_SHEETS)) {
    const sheet = doc.sheetsById[config.gid];
    raw[key] = sheet ? await loadRawSheet(sheet) : [];
  }

  return {
    raw,
    quotationForm: parseQuotationForm(raw.quotation_form || []),
    quotationAnalysis: parseQuotationAnalysis(raw.quotation_analysis || []),
    costSettings: parseCostSettings(raw.cost_settings || []),
    processAnalysis: parseProcessAnalysis(raw.process_analysis || []),
    breakEven: parseBreakEven(raw.break_even || []),
    historyStats: parseHistoryStats(raw.history_stats || []),
    marginSettings: parseMarginSettings(raw.margin_settings || []),
  };
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  const numeric = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildQuotationSummary(data) {
  const quotations = data.quotationAnalysis.quotations || [];
  const costItems = data.costSettings.costItems || [];
  const processSteps = data.processAnalysis.processSteps || [];
  const materials = data.processAnalysis.materials || [];
  const quoteItems = data.quotationForm.items || [];
  const history = data.historyStats.quotationHistory || [];
  const marginTargets = data.marginSettings.targets || [];

  const totalAmount = quotations.reduce((sum, row) => sum + toNumber(row['訂單數量']) * toNumber(row['售價/件']), 0);
  const avgMargin = quotations.length
    ? quotations.reduce((sum, row) => sum + toNumber(row['毛利率']), 0) / quotations.length
    : 0;

  return {
    cards: {
      quotationCount: quotations.length,
      totalAmount,
      avgMargin,
      costItemCount: costItems.length,
      processStepCount: processSteps.length,
      materialCount: materials.length,
      quoteItemCount: quoteItems.length,
      historyCount: history.length,
      marginRuleCount: marginTargets.length,
    },
    statusDistribution: Object.entries(
      quotations.reduce((acc, row) => {
        const key = String(row['報價狀態'] || '未分類').trim() || '未分類';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})
    ).map(([label, count]) => ({ label, count })),
    customerAmount: quotations
      .map((row) => ({
        label: String(row['客戶名稱'] || '未命名客戶'),
        amount: toNumber(row['訂單數量']) * toNumber(row['售價/件']),
      }))
      .sort((a, b) => b.amount - a.amount),
    costCategories: Object.entries(
      costItems.reduce((acc, row) => {
        const key = String(row['成本類別'] || '未分類').trim() || '未分類';
        acc[key] = (acc[key] || 0) + toNumber(row['小計(TWD)']);
        return acc;
      }, {})
    )
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount),
    processCategories: Object.entries(
      processSteps.reduce((acc, row) => {
        const key = String(row['製程類別'] || '未分類').trim() || '未分類';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})
    ).map(([label, count]) => ({ label, count })),
  };
}

async function getQuotationDashboard() {
  const sheets = await getQuotationSheets();
  const summary = buildQuotationSummary(sheets);
  return { sheets, summary };
}

module.exports = {
  QUOTATION_SHEETS,
  getQuotationSheets,
  getQuotationDashboard,
};
