// db/crmModel.js
const { pool } = require('./mysql');

// 取得所有資料（供儀表板使用，對應原 /api/all）
async function getAll() {
  const [customers] = await pool.query('SELECT * FROM crm_customers ORDER BY customer_no');
  const [sales]     = await pool.query('SELECT * FROM crm_sales     ORDER BY sale_id');
  const [orders]    = await pool.query('SELECT * FROM crm_orders    ORDER BY order_id');
  const [followup]  = await pool.query('SELECT * FROM crm_followup  ORDER BY follow_id');
  const [reps]      = await pool.query('SELECT * FROM crm_reps      ORDER BY rep_id');
  return { customers, sales, orders, followup, reps };
}

// 取得單一工作表
async function getSheet(name) {
  const tableMap = {
    customers: 'crm_customers',
    sales    : 'crm_sales',
    orders   : 'crm_orders',
    followup : 'crm_followup',
    reps     : 'crm_reps',
  };
  const table = tableMap[name];
  if (!table) throw new Error(`未知工作表名稱: ${name}`);
  const [rows] = await pool.query(`SELECT * FROM ${table}`);
  return rows;
}

// KPI：業務員業績
async function getRepKPI() {
  const [rows] = await pool.query(`
    SELECT
      c.rep                                           AS 業務員,
      COUNT(DISTINCT c.id)                            AS 客戶數,
      SUM(s.status = '成交')                          AS 成交數,
      SUM(s.status = '流失')                          AS 流失數,
      ROUND(IFNULL(SUM(s.status='成交')/NULLIF(COUNT(s.id),0)*100,0),1) AS 成交率,
      IFNULL(SUM(o.amount),0)                         AS 訂單總額,
      ROUND(IFNULL(AVG(c.satisfaction),0),1)          AS 平均滿意度
    FROM crm_customers c
    LEFT JOIN crm_sales    s ON s.customer_id = c.customer_no
    LEFT JOIN crm_orders   o ON o.customer_id = c.customer_no
    WHERE c.rep IS NOT NULL AND c.rep != ''
    GROUP BY c.rep
    ORDER BY 成交數 DESC
  `);
  return rows;
}

// KPI：月度趨勢
async function getMonthlyTrend(months = 12) {
  const [rows] = await pool.query(`
    SELECT
      SUBSTR(order_date,1,7)      AS 月份,
      COUNT(*)                    AS 訂單數,
      SUM(amount)                 AS 月營收,
      COUNT(DISTINCT customer_id) AS 客戶數
    FROM crm_orders
    WHERE order_date IS NOT NULL AND order_date != ''
    GROUP BY 月份
    ORDER BY 月份 DESC
    LIMIT ?
  `, [months]);
  return rows.reverse();
}

// KPI：地區分析
async function getRegionStats() {
  const [rows] = await pool.query(`
    SELECT
      region                         AS 地區,
      COUNT(*)                       AS 客戶數,
      SUM(status='成交')              AS 成交數,
      ROUND(AVG(satisfaction),1)     AS 平均滿意度
    FROM crm_customers
    WHERE region IS NOT NULL AND region != ''
    GROUP BY region
    ORDER BY 客戶數 DESC
  `);
  return rows;
}

// KPI：流失預警（超過30天未跟進）
async function getChurnRisk(days = 30) {
  const [rows] = await pool.query(`
    SELECT
      c.customer_no                              AS 客戶ID,
      c.company                                  AS 公司,
      c.tier                                     AS 等級,
      c.rep                                      AS 業務員,
      MAX(f.follow_date)                         AS 最後跟進,
      DATEDIFF(NOW(), MAX(f.follow_date))        AS 間隔天數
    FROM crm_customers c
    LEFT JOIN crm_followup f ON f.customer_id = c.customer_no
    WHERE c.status NOT IN ('流失','暫緩')
    GROUP BY c.id
    HAVING 間隔天數 IS NULL OR 間隔天數 > ?
    ORDER BY 間隔天數 DESC
    LIMIT 50
  `, [days]);
  return rows;
}

// 同步記錄
async function getSyncLogs(limit = 20) {
  const [rows] = await pool.query(`
    SELECT * FROM sync_logs ORDER BY synced_at DESC LIMIT ?
  `, [limit]);
  return rows;
}

module.exports = {
  getAll, getSheet,
  getRepKPI, getMonthlyTrend, getRegionStats, getChurnRisk,
  getSyncLogs,
};
