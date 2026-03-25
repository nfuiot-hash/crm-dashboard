// db/mysql.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host              : process.env.DB_HOST     || 'localhost',
  port              : Number(process.env.DB_PORT) || 3306,
  user              : process.env.DB_USER     || 'crm_app',
  password          : process.env.DB_PASS     || '',
  database          : process.env.DB_NAME     || 'crm_system',
  charset           : 'utf8mb4',
  waitForConnections: true,
  connectionLimit   : 10,
  timezone          : '+08:00',
});

// 測試連線
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL 連線成功');
    conn.release();
    return true;
  } catch (err) {
    console.error('❌ MySQL 連線失敗:', err.message);
    return false;
  }
}

module.exports = { pool, testConnection };
