require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function init() {
  const adminUser = process.env.DB_ROOT_USER || 'root';
  const adminPassword = process.env.DB_ROOT_PASS || '';
  const dbName = process.env.DB_NAME || 'crm_system';
  const appUser = process.env.DB_USER || 'crm_app';
  const appPassword = process.env.DB_PASS || '';

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: adminUser,
    password: adminPassword,
    charset: 'utf8mb4',
    multipleStatements: false,
  });

  console.log('Initializing CRM database...');

  await conn.query(`
    CREATE DATABASE IF NOT EXISTS \`${dbName}\`
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await conn.query(`USE \`${dbName}\``);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(50) NOT NULL,
      email VARCHAR(100),
      role ENUM('admin','sales','viewer') DEFAULT 'viewer',
      status ENUM('active','disabled','locked') DEFAULT 'active',
      dept VARCHAR(50),
      failed_count INT DEFAULT 0,
      locked_until DATETIME,
      last_login DATETIME,
      created_at DATETIME DEFAULT NOW(),
      updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      username VARCHAR(50),
      ip VARCHAR(45),
      status ENUM('success','failed','locked'),
      reason VARCHAR(100),
      created_at DATETIME DEFAULT NOW(),
      INDEX idx_user (user_id),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      username VARCHAR(50),
      action VARCHAR(50),
      target VARCHAR(100),
      detail TEXT,
      ip VARCHAR(45),
      created_at DATETIME DEFAULT NOW(),
      INDEX idx_user (user_id),
      INDEX idx_action (action),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS crm_customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_no VARCHAR(20),
      company VARCHAR(100),
      contact VARCHAR(50),
      title VARCHAR(50),
      phone VARCHAR(30),
      email VARCHAR(100),
      industry VARCHAR(50),
      region VARCHAR(20),
      tier VARCHAR(5),
      revenue DECIMAL(15,2) DEFAULT 0,
      status VARCHAR(20),
      satisfaction DECIMAL(3,1),
      rep VARCHAR(50),
      order_count INT DEFAULT 0,
      note TEXT,
      created_at VARCHAR(30),
      updated_at VARCHAR(30),
      synced_at DATETIME DEFAULT NOW(),
      INDEX idx_tier (tier),
      INDEX idx_region (region),
      INDEX idx_status (status),
      INDEX idx_rep (rep)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS crm_sales (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sale_id VARCHAR(20),
      customer_id VARCHAR(20),
      company VARCHAR(100),
      status VARCHAR(20),
      currency VARCHAR(10),
      amount DECIMAL(15,2) DEFAULT 0,
      expected_date VARCHAR(30),
      actual_date VARCHAR(30),
      rep VARCHAR(50),
      note TEXT,
      created_at VARCHAR(30),
      updated_at VARCHAR(30),
      synced_at DATETIME DEFAULT NOW(),
      INDEX idx_customer (customer_id),
      INDEX idx_status (status),
      INDEX idx_rep (rep)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS crm_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id VARCHAR(20),
      customer_id VARCHAR(20),
      company VARCHAR(100),
      order_date VARCHAR(30),
      amount DECIMAL(15,2) DEFAULT 0,
      tax_amount DECIMAL(15,2) DEFAULT 0,
      currency VARCHAR(10),
      pay_status VARCHAR(20),
      pay_date VARCHAR(30),
      rep VARCHAR(50),
      note TEXT,
      synced_at DATETIME DEFAULT NOW(),
      INDEX idx_customer (customer_id),
      INDEX idx_pay_status (pay_status),
      INDEX idx_order_date (order_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS crm_followup (
      id INT AUTO_INCREMENT PRIMARY KEY,
      follow_id VARCHAR(20),
      customer_id VARCHAR(20),
      follow_date VARCHAR(30),
      rep VARCHAR(50),
      method VARCHAR(20),
      content TEXT,
      next_date VARCHAR(30),
      result VARCHAR(20),
      synced_at DATETIME DEFAULT NOW(),
      INDEX idx_customer (customer_id),
      INDEX idx_follow_date (follow_date),
      INDEX idx_rep (rep)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS crm_reps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      rep_id VARCHAR(20),
      name VARCHAR(50),
      email VARCHAR(100),
      dept VARCHAR(50),
      phone VARCHAR(30),
      status VARCHAR(20),
      synced_at DATETIME DEFAULT NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sheet_name VARCHAR(50),
      rows_synced INT DEFAULT 0,
      status ENUM('success','failed'),
      message TEXT,
      synced_at DATETIME DEFAULT NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [existing] = await conn.query('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!existing.length) {
    const hash = await bcrypt.hash('Admin@2026!', 12);
    await conn.query(`
      INSERT INTO users (username, password, name, role, status, dept)
      VALUES (?, ?, ?, 'admin', 'active', 'Management')
    `, ['admin', hash, 'System Admin']);
    console.log('Created default admin account');
    console.log('  username: admin');
    console.log('  password: Admin@2026!  (change it after first login)');
  } else {
    console.log('Default admin account already exists');
  }

  try {
    await conn.query(`CREATE USER IF NOT EXISTS '${appUser}'@'localhost' IDENTIFIED BY '${appPassword}'`);
    await conn.query(`CREATE USER IF NOT EXISTS '${appUser}'@'%' IDENTIFIED BY '${appPassword}'`);
    await conn.query(`ALTER USER '${appUser}'@'localhost' IDENTIFIED BY '${appPassword}'`);
    await conn.query(`ALTER USER '${appUser}'@'%' IDENTIFIED BY '${appPassword}'`);
    await conn.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${dbName}\`.* TO '${appUser}'@'localhost'`);
    await conn.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${dbName}\`.* TO '${appUser}'@'%'`);
    await conn.query('FLUSH PRIVILEGES');
    console.log(`Provisioned MySQL app user ${appUser}`);
  } catch (err) {
    console.log(`Skipped app-user provisioning: ${err.message}`);
  }

  await conn.end();
  console.log('\nDatabase initialization finished.');
  console.log('Start the app with: npm run start');
}

init().catch((err) => {
  console.error('Initialization failed:', err.message);
  process.exit(1);
});
