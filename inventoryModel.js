require('dotenv').config();
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const INVENTORY_SPREADSHEET_ID = '1o2dZPyD0Q65P6KAS8FD7Cr6Id0BM-Ceh0DJr8D3X-qg';

const INVENTORY_SHEETS = {
  parts_stock: { title: '零件庫存', gid: 1025086822 },
  purchase_records: { title: '零件採購紀錄', gid: 559704220 },
  suppliers: { title: '供應商', gid: 979534670 },
  stock_movements: { title: '零件入出庫記錄', gid: 1739641132 },
  stocktake: { title: '零件盤點', gid: 268794645 },
  finished_goods: { title: '成品庫存', gid: 1889543009 },
  product_models: { title: '成品型號', gid: 1340881407 },
};

function loadCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return parsed;
  }

  return require(path.join(__dirname, 'credentials.json'));
}

function toValue(value) {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim();
  if (!text) return '';
  const numeric = Number(text.replace(/,/g, '').replace(/%/g, ''));
  return Number.isFinite(numeric) ? numeric : text;
}

async function loadSheetRows(sheet) {
  for (const headerRowIndex of [1, 2, 3, 4, 5]) {
    try {
      await sheet.loadHeaderRow(headerRowIndex);
      const headers = sheet.headerValues || [];
      if (!headers.length) continue;

      const rows = await sheet.getRows();
      return rows.map((row) => {
        const mapped = {};
        headers.forEach((header) => {
          mapped[header] = toValue(row[header]);
        });
        return mapped;
      });
    } catch (_) {
      // Try next header row.
    }
  }

  return [];
}

async function getInventorySheets() {
  const doc = new GoogleSpreadsheet(INVENTORY_SPREADSHEET_ID);
  await doc.useServiceAccountAuth(loadCredentials());
  await doc.loadInfo();

  const result = {};
  for (const [key, config] of Object.entries(INVENTORY_SHEETS)) {
    const sheet = doc.sheetsById[config.gid];
    result[key] = sheet ? await loadSheetRows(sheet) : [];
  }

  return result;
}

function pickText(row, key, fallback = '') {
  return String(row?.[key] ?? fallback).trim();
}

function pickNumber(row, key, fallback = 0) {
  const raw = row?.[key];
  if (typeof raw === 'number') return raw;
  const numeric = Number(String(raw ?? '').replace(/,/g, '').replace(/%/g, '').trim());
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizePercentValue(value) {
  if (!Number.isFinite(value)) return Number.NaN;
  return Math.abs(value) > 1 ? value / 100 : value;
}

function isSoldStatus(status) {
  return /已售|售出|已出貨|出貨/.test(status || '');
}

function isRepairStatus(status) {
  return /維修/.test(status || '');
}

function normalizeParts(rows) {
  return rows.map((row) => {
    const currentStock = pickNumber(row, '現有庫存');
    const reserved = pickNumber(row, '已預留');
    const inbound = pickNumber(row, '採購中');
    const available = pickNumber(row, '可用庫存', currentStock - reserved + inbound);
    const safetyStock = pickNumber(row, '安全庫存');
    const unitCost = pickNumber(row, '成本價');
    const stockValue = pickNumber(row, '庫存金額', currentStock * unitCost);
    const restockNeeded = Math.max(0, pickNumber(row, '建議補貨量', available < safetyStock ? safetyStock - available : 0));

    return {
      code: pickText(row, '零件編號'),
      name: pickText(row, '零件名稱'),
      category: pickText(row, '類別', '未分類'),
      unit: pickText(row, '單位'),
      spec: pickText(row, '規格'),
      currentStock,
      reserved,
      inbound,
      available,
      safetyStock,
      restockNeeded,
      unitCost,
      stockValue,
      location: pickText(row, '儲位'),
      modelCodes: pickText(row, '適用機型代號'),
      raw: row,
    };
  });
}

function normalizePurchaseRecords(rows) {
  return rows.map((row) => ({
    orderNo: pickText(row, '採購單號'),
    supplierCode: pickText(row, '供應商代號'),
    supplierName: pickText(row, '供應商名稱'),
    createdDate: pickText(row, '建立日期'),
    eta: pickText(row, '預計到貨'),
    receivedDate: pickText(row, '實際到貨'),
    status: pickText(row, '狀態', '未設定'),
    note: pickText(row, '備註'),
    owner: pickText(row, '負責人'),
    raw: row,
  }));
}

function normalizeSuppliers(rows) {
  return rows.map((row) => ({
    code: pickText(row, '供應商代號'),
    name: pickText(row, '供應商名稱', '未命名供應商'),
    contact: pickText(row, '聯絡人'),
    phone: pickText(row, '電話'),
    email: pickText(row, 'Email'),
    category: pickText(row, '供應類別'),
    region: pickText(row, '國家地區'),
    leadDays: pickNumber(row, '交期天數'),
    paymentDays: pickNumber(row, '付款天數'),
    score: pickNumber(row, '評分'),
    status: pickText(row, '狀態', '未設定'),
    address: pickText(row, '地址'),
    raw: row,
  }));
}

function normalizeMovements(rows) {
  return rows.map((row) => ({
    recordNo: pickText(row, '記錄編號'),
    date: pickText(row, '日期'),
    type: pickText(row, '異動類型', '未設定'),
    partCode: pickText(row, '零件編號'),
    partName: pickText(row, '零件名稱'),
    quantity: pickNumber(row, '數量'),
    unitPrice: pickNumber(row, '單價'),
    amount: pickNumber(row, '金額'),
    note: pickText(row, '備註'),
    operator: pickText(row, '操作人員'),
    raw: row,
  }));
}

function normalizeStocktake(rows) {
  return rows.map((row) => {
    const systemStock = pickNumber(row, '系統庫存');
    const actualStock = pickNumber(row, '實盤數量');
    const diffQty = pickNumber(row, '差異數量', actualStock - systemStock);
    const sheetRate = normalizePercentValue(pickNumber(row, '差異率', Number.NaN));
    const derivedRate = systemStock === 0 ? 0 : diffQty / systemStock;

    return {
      date: pickText(row, '盤點日期'),
      partCode: pickText(row, '零件編號'),
      partName: pickText(row, '零件名稱'),
      systemStock,
      actualStock,
      diffQty,
      diffRate: Number.isFinite(sheetRate) ? sheetRate : derivedRate,
      status: pickText(row, '狀態', '未設定'),
      note: pickText(row, '備註'),
      raw: row,
    };
  });
}

function normalizeFinishedGoods(rows) {
  return rows.map((row) => ({
    serialNo: pickText(row, '機身序號'),
    modelNo: pickText(row, '型號編號'),
    modelName: pickText(row, '型號名稱'),
    assembledAt: pickText(row, '組裝日期'),
    status: pickText(row, '狀態', '未設定'),
    note: pickText(row, '客戶備註'),
    raw: row,
  }));
}

function normalizeProductModels(rows) {
  return rows.map((row) => ({
    modelNo: pickText(row, '型號編號'),
    modelName: pickText(row, '型號名稱'),
    machineCode: pickText(row, '機型代號', '未設定'),
    typeDesc: pickText(row, '類型說明'),
    specDesc: pickText(row, '規格說明'),
    price: pickNumber(row, '售價'),
    raw: row,
  }));
}

function groupByCount(items, keyGetter) {
  return Object.entries(
    items.reduce((acc, item) => {
      const key = keyGetter(item) || '未設定';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function groupBySum(items, keyGetter, valueGetter) {
  return Object.entries(
    items.reduce((acc, item) => {
      const key = keyGetter(item) || '未設定';
      acc[key] = (acc[key] || 0) + valueGetter(item);
      return acc;
    }, {})
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function buildSupplierPerformance(suppliers, purchaseRecords) {
  return suppliers
    .map((supplier) => {
      const relatedOrders = purchaseRecords.filter((item) => item.supplierName === supplier.name);
      const delivered = relatedOrders.filter((item) => item.receivedDate).length;
      const pending = relatedOrders.filter((item) => !item.receivedDate).length;
      const onTimeRate = relatedOrders.length ? delivered / relatedOrders.length : 0;
      const performance = Math.max(
        0,
        Math.round((supplier.score || 0) * 0.7 + Math.max(0, 100 - supplier.leadDays * 2) * 0.3)
      );

      return {
        name: supplier.name,
        score: supplier.score,
        leadDays: supplier.leadDays,
        paymentDays: supplier.paymentDays,
        status: supplier.status,
        totalOrders: relatedOrders.length,
        delivered,
        pending,
        onTimeRate,
        performance,
      };
    })
    .sort((a, b) => b.performance - a.performance);
}

function buildFinishedGoodsWaterLevel(finishedGoods, productModels) {
  const byModelNo = new Map(productModels.map((item) => [item.modelNo, item]));

  const grouped = finishedGoods.reduce((acc, item) => {
    const model = byModelNo.get(item.modelNo);
    const key = model?.machineCode || '未設定';
    if (!acc[key]) {
      acc[key] = {
        machineCode: key,
        modelNames: new Set(),
        inventoryCount: 0,
        soldCount: 0,
        repairCount: 0,
      };
    }

    if (model?.modelName) {
      acc[key].modelNames.add(model.modelName);
    } else if (item.modelName) {
      acc[key].modelNames.add(item.modelName);
    }

    if (isSoldStatus(item.status)) {
      acc[key].soldCount += 1;
    } else if (isRepairStatus(item.status)) {
      acc[key].repairCount += 1;
    } else {
      acc[key].inventoryCount += 1;
    }

    return acc;
  }, {});

  return Object.values(grouped)
    .map((item) => ({
      machineCode: item.machineCode,
      modelName: [...item.modelNames].filter(Boolean).join(' / ') || '未設定型號',
      inventoryCount: item.inventoryCount,
      soldCount: item.soldCount,
      repairCount: item.repairCount,
    }))
    .sort((a, b) => (b.inventoryCount + b.soldCount) - (a.inventoryCount + a.soldCount));
}

function buildStocktakeMetrics(stocktakeRows) {
  const totalCount = stocktakeRows.length;
  const abnormalCount = stocktakeRows.filter((item) => item.diffQty !== 0).length;
  const missingCount = stocktakeRows.filter((item) => item.diffQty < 0).length;
  const avgDiffRate = totalCount
    ? stocktakeRows.reduce((sum, item) => sum + Math.abs(item.diffRate), 0) / totalCount
    : 0;

  return {
    totalCount,
    abnormalCount,
    missingCount,
    avgDiffRate,
    topVariance: stocktakeRows
      .slice()
      .sort((a, b) => Math.abs(b.diffRate) - Math.abs(a.diffRate))
      .slice(0, 6),
    statusDistribution: groupByCount(stocktakeRows, (item) => item.status),
  };
}

function buildInventorySummary(data) {
  const parts = normalizeParts(data.parts_stock || []);
  const purchaseRecords = normalizePurchaseRecords(data.purchase_records || []);
  const suppliers = normalizeSuppliers(data.suppliers || []);
  const stockMovements = normalizeMovements(data.stock_movements || []);
  const stocktake = normalizeStocktake(data.stocktake || []);
  const finishedGoods = normalizeFinishedGoods(data.finished_goods || []);
  const productModels = normalizeProductModels(data.product_models || []);

  const lowStockParts = parts
    .filter((item) => item.available <= item.safetyStock)
    .sort((a, b) => (a.available - a.safetyStock) - (b.available - b.safetyStock));

  const partStatus = {
    safe: parts.filter((item) => item.available > item.safetyStock).length,
    warning: parts.filter((item) => item.available <= item.safetyStock && item.available > 0).length,
    zero: parts.filter((item) => item.available <= 0).length,
  };

  const finishedStatus = groupByCount(finishedGoods, (item) => item.status);
  const finishedWaterLevel = buildFinishedGoodsWaterLevel(finishedGoods, productModels);
  const supplierPerformance = buildSupplierPerformance(suppliers, purchaseRecords);
  const stocktakeMetrics = buildStocktakeMetrics(stocktake);

  return {
    normalized: {
      parts,
      purchaseRecords,
      suppliers,
      stockMovements,
      stocktake,
      finishedGoods,
      productModels,
    },
    cards: {
      totalPartAsset: parts.reduce((sum, item) => sum + item.stockValue, 0),
      totalPartSku: parts.length,
      lowStockCount: lowStockParts.length,
      totalFinishedGoods: finishedGoods.length,
      finishedInStock: finishedGoods.filter((item) => !isSoldStatus(item.status)).length,
      soldFinishedGoods: finishedGoods.filter((item) => isSoldStatus(item.status)).length,
      purchaseOrderCount: purchaseRecords.length,
      supplierCount: suppliers.length,
      stocktakeCount: stocktake.length,
    },
    partWaterLevel: {
      safeCount: partStatus.safe,
      warningCount: partStatus.warning,
      zeroCount: partStatus.zero,
      totalAvailable: parts.reduce((sum, item) => sum + item.available, 0),
      totalReserved: parts.reduce((sum, item) => sum + item.reserved, 0),
      totalInbound: parts.reduce((sum, item) => sum + item.inbound, 0),
      lowStockParts: lowStockParts.slice(0, 10),
      categoryValueShare: groupBySum(parts, (item) => item.category, (item) => item.stockValue),
    },
    finishedGoodsWaterLevel: {
      statusDistribution: finishedStatus,
      byMachineCode: finishedWaterLevel,
    },
    supplierPerformance,
    purchaseStatusDistribution: groupByCount(purchaseRecords, (item) => item.status),
    stocktakeMetrics,
    rawSheets: data,
  };
}

async function getInventoryDashboard() {
  const sheets = await getInventorySheets();
  return {
    sheets,
    summary: buildInventorySummary(sheets),
  };
}

module.exports = {
  INVENTORY_SHEETS,
  getInventorySheets,
  getInventoryDashboard,
};
