// db/userModel.js
const { pool } = require('./mysql');
const bcrypt   = require('bcryptjs');

const LOCK_THRESHOLD = 5;    // 連續失敗次數
const LOCK_MINUTES   = 30;   // 鎖定分鐘數

// 查詢帳號（含密碼）
async function findByUsername(username) {
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  return rows[0] || null;
}

// 查詢帳號（不含密碼）
async function findById(id) {
  const [rows] = await pool.query(
    'SELECT id,username,name,email,role,status,dept,last_login,created_at FROM users WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

// 取得所有帳號
async function listUsers() {
  const [rows] = await pool.query(`
    SELECT id,username,name,email,role,status,dept,
           failed_count,locked_until,last_login,created_at,updated_at
    FROM users ORDER BY created_at DESC
  `);
  return rows;
}

// 建立帳號
async function createUser({ username, password, name, email, role, dept }) {
  const hash = await bcrypt.hash(password, 12);
  const [result] = await pool.query(`
    INSERT INTO users (username,password,name,email,role,dept)
    VALUES (?,?,?,?,?,?)
  `, [username, hash, name, email || null, role || 'viewer', dept || null]);
  return result.insertId;
}

// 更新帳號基本資料
async function updateUser(id, { name, email, role, dept, status }) {
  await pool.query(`
    UPDATE users SET name=?, email=?, role=?, dept=?, status=?
    WHERE id=?
  `, [name, email || null, role, dept || null, status, id]);
}

// 修改密碼
async function changePassword(id, newPassword) {
  const hash = await bcrypt.hash(newPassword, 12);
  await pool.query('UPDATE users SET password=? WHERE id=?', [hash, id]);
}

// 驗證密碼
async function verifyPassword(user, inputPassword) {
  return bcrypt.compare(inputPassword, user.password);
}

// 登入成功：清除失敗計數、更新 last_login
async function onLoginSuccess(id) {
  await pool.query(`
    UPDATE users SET failed_count=0, locked_until=NULL, last_login=NOW()
    WHERE id=?
  `, [id]);
}

// 登入失敗：累加失敗計數，達閾值則鎖定
async function onLoginFail(id) {
  await pool.query(`
    UPDATE users
    SET failed_count = failed_count + 1,
        locked_until = CASE
          WHEN failed_count + 1 >= ? THEN DATE_ADD(NOW(), INTERVAL ? MINUTE)
          ELSE locked_until
        END
    WHERE id=?
  `, [LOCK_THRESHOLD, LOCK_MINUTES, id]);
}

// 檢查是否被鎖定
async function isLocked(user) {
  if (user.status === 'locked' || user.status === 'disabled') return true;
  if (user.locked_until && new Date(user.locked_until) > new Date()) return true;
  return false;
}

// 解除鎖定
async function unlockUser(id) {
  await pool.query(`
    UPDATE users SET status='active', failed_count=0, locked_until=NULL WHERE id=?
  `, [id]);
}

// 停用帳號
async function disableUser(id) {
  await pool.query(`UPDATE users SET status='disabled' WHERE id=?`, [id]);
}

// 刪除帳號
async function deleteUser(id) {
  await pool.query('DELETE FROM users WHERE id=?', [id]);
}

// 記錄登入日誌
async function logLogin({ userId, username, ip, status, reason }) {
  await pool.query(`
    INSERT INTO login_logs (user_id,username,ip,status,reason)
    VALUES (?,?,?,?,?)
  `, [userId || null, username, ip || null, status, reason || null]);
}

// 記錄操作稽核
async function logAudit({ userId, username, action, target, detail, ip }) {
  await pool.query(`
    INSERT INTO audit_logs (user_id,username,action,target,detail,ip)
    VALUES (?,?,?,?,?,?)
  `, [userId, username, action, target || null, detail || null, ip || null]);
}

// 取得登入記錄（最近100筆）
async function getLoginLogs(limit = 100) {
  const [rows] = await pool.query(`
    SELECT * FROM login_logs ORDER BY created_at DESC LIMIT ?
  `, [limit]);
  return rows;
}

module.exports = {
  findByUsername, findById, listUsers,
  createUser, updateUser, changePassword,
  verifyPassword, onLoginSuccess, onLoginFail,
  isLocked, unlockUser, disableUser, deleteUser,
  logLogin, logAudit, getLoginLogs,
};
