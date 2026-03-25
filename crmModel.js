const { pool } = require('./mysql');

const FUNNEL_STAGES = ['潛在', '初步接觸', '需求確認', '洽談中', '報價中', '成交'];
const FINAL_STATES = ['暫緩', '流失'];

async function getAll() {
  const [customers] = await pool.query('SELECT * FROM crm_customers ORDER BY customer_no');
  const [sales] = await pool.query('SELECT * FROM crm_sales ORDER BY sale_id');
  const [orders] = await pool.query('SELECT * FROM crm_orders ORDER BY order_id');
  const [followup] = await pool.query('SELECT * FROM crm_followup ORDER BY follow_id');
  const [reps] = await pool.query('SELECT * FROM crm_reps ORDER BY rep_id');
  return { customers, sales, orders, followup, reps };
}

async function getSheet(name) {
  const tableMap = {
    customers: 'crm_customers',
    sales: 'crm_sales',
    orders: 'crm_orders',
    followup: 'crm_followup',
    reps: 'crm_reps',
  };
  const table = tableMap[name];
  if (!table) throw new Error(`Unknown sheet: ${name}`);
  const [rows] = await pool.query(`SELECT * FROM ${table}`);
  return rows;
}

async function getRepWinRate() {
  const [rows] = await pool.query(`
    SELECT
      s.rep AS rep,
      COUNT(*) AS total_sales,
      SUM(CASE WHEN s.status = '成交' THEN 1 ELSE 0 END) AS won_sales,
      ROUND(SUM(CASE WHEN s.status = '成交' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100, 1) AS win_rate,
      ROUND(SUM(CASE WHEN s.status = '成交' THEN s.amount ELSE 0 END), 2) AS won_amount
    FROM crm_sales s
    WHERE s.rep IS NOT NULL AND s.rep <> ''
    GROUP BY s.rep
    ORDER BY win_rate DESC, won_sales DESC, total_sales DESC
  `);
  return rows;
}

async function getMonthlyRevenueTrend(months = 12) {
  const [rows] = await pool.query(`
    SELECT
      DATE_FORMAT(STR_TO_DATE(order_date, '%Y-%m-%d'), '%Y-%m') AS month,
      COUNT(*) AS order_count,
      ROUND(SUM(amount), 2) AS revenue,
      COUNT(DISTINCT customer_id) AS customer_count
    FROM crm_orders
    WHERE STR_TO_DATE(order_date, '%Y-%m-%d') IS NOT NULL
    GROUP BY month
    ORDER BY month DESC
    LIMIT ?
  `, [months]);
  return rows.reverse();
}

async function getTierRegionMatrix() {
  const [rows] = await pool.query(`
    SELECT
      region,
      tier,
      COUNT(*) AS customer_count,
      ROUND(AVG(COALESCE(satisfaction, 0)), 1) AS avg_satisfaction
    FROM crm_customers
    WHERE region IS NOT NULL AND region <> ''
      AND tier IS NOT NULL AND tier <> ''
    GROUP BY region, tier
    ORDER BY region, tier
  `);
  return rows;
}

async function getChurnAlerts(days = 30) {
  const [rows] = await pool.query(`
    SELECT
      c.customer_no AS customer_id,
      c.company,
      c.tier,
      c.region,
      c.rep,
      MAX(STR_TO_DATE(f.follow_date, '%Y-%m-%d')) AS last_follow_date,
      DATEDIFF(CURDATE(), MAX(STR_TO_DATE(f.follow_date, '%Y-%m-%d'))) AS days_since_followup
    FROM crm_customers c
    LEFT JOIN crm_followup f ON f.customer_id = c.customer_no
    WHERE c.status <> '流失'
    GROUP BY c.id, c.customer_no, c.company, c.tier, c.region, c.rep
    HAVING last_follow_date IS NULL OR days_since_followup > ?
    ORDER BY days_since_followup DESC, company ASC
    LIMIT 50
  `, [days]);
  return rows.map((row) => ({
    ...row,
    risk_level:
      row.days_since_followup == null ? '高' :
      row.days_since_followup > 90 ? '高' :
      row.days_since_followup > 60 ? '中' : '低',
  }));
}

async function getSalesFunnel() {
  const [rows] = await pool.query(`
    SELECT status, COUNT(*) AS count
    FROM crm_sales
    GROUP BY status
  `);

  const countMap = new Map(rows.map((row) => [row.status, Number(row.count)]));
  const ordered = FUNNEL_STAGES.map((stage, index) => {
    const count = countMap.get(stage) || 0;
    const prevCount = index === 0 ? count : (countMap.get(FUNNEL_STAGES[index - 1]) || 0);
    return {
      stage,
      count,
      conversion_rate: index === 0 ? 100 : Number(((count / Math.max(prevCount, 1)) * 100).toFixed(1)),
    };
  });

  for (const stage of FINAL_STATES) {
    ordered.push({
      stage,
      count: countMap.get(stage) || 0,
      conversion_rate: 0,
    });
  }

  return ordered;
}

async function getDashboardKPI() {
  const [repWinRate, monthlyRevenue, tierRegionMatrix, churnAlerts, salesFunnel] = await Promise.all([
    getRepWinRate(),
    getMonthlyRevenueTrend(),
    getTierRegionMatrix(),
    getChurnAlerts(),
    getSalesFunnel(),
  ]);

  return { repWinRate, monthlyRevenue, tierRegionMatrix, churnAlerts, salesFunnel };
}

async function getSyncLogs(limit = 20) {
  const [rows] = await pool.query(`
    SELECT * FROM sync_logs ORDER BY synced_at DESC LIMIT ?
  `, [limit]);
  return rows;
}

module.exports = {
  getAll,
  getSheet,
  getRepWinRate,
  getMonthlyRevenueTrend,
  getTierRegionMatrix,
  getChurnAlerts,
  getSalesFunnel,
  getDashboardKPI,
  getSyncLogs,
};
