// routes/adminRoutes.js
const express   = require('express');
const router    = express.Router();
const userModel = require('./userModel');
const crmModel  = require('./crmModel');
const { requireAdmin, getIP } = require('./auth');

// 所有路由都需要 admin 權限
router.use(requireAdmin);

// GET /api/admin/users  ─  取得所有帳號
router.get('/users', async (req, res) => {
  try {
    const users = await userModel.listUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// POST /api/admin/users  ─  新增帳號
router.post('/users', async (req, res) => {
  const { username, password, name, email, role, dept } = req.body;
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'missing_fields', message: '帳號、密碼、姓名為必填' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'weak_password', message: '密碼至少需要 8 個字元' });
  }
  try {
    const id = await userModel.createUser({ username, password, name, email, role, dept });
    await userModel.logAudit({
      userId: req.user.id, username: req.user.username,
      action: 'CREATE_USER', target: username,
      detail: `role=${role}, dept=${dept}`, ip: getIP(req),
    });
    res.json({ ok: true, id, message: `帳號 ${username} 建立成功` });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'duplicate_username', message: '此帳號名稱已存在' });
    }
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// PUT /api/admin/users/:id  ─  更新帳號
router.put('/users/:id', async (req, res) => {
  const { name, email, role, dept, status } = req.body;
  const targetId = Number(req.params.id);
  // 不可修改自己的角色
  if (targetId === req.user.id && role && role !== req.user.role) {
    return res.status(400).json({ error: 'self_role_change', message: '不可修改自己的角色' });
  }
  try {
    await userModel.updateUser(targetId, { name, email, role, dept, status });
    await userModel.logAudit({
      userId: req.user.id, username: req.user.username,
      action: 'UPDATE_USER', target: String(targetId),
      detail: `role=${role}, status=${status}`, ip: getIP(req),
    });
    res.json({ ok: true, message: '帳號更新成功' });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// POST /api/admin/users/:id/reset-password  ─  重設密碼
router.post('/users/:id/reset-password', async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'weak_password', message: '新密碼至少需要 8 個字元' });
  }
  try {
    await userModel.changePassword(Number(req.params.id), newPassword);
    const target = await userModel.findById(Number(req.params.id));
    await userModel.logAudit({
      userId: req.user.id, username: req.user.username,
      action: 'RESET_PASSWORD', target: target?.username,
      ip: getIP(req),
    });
    res.json({ ok: true, message: '密碼重設成功' });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// POST /api/admin/users/:id/unlock  ─  解除鎖定
router.post('/users/:id/unlock', async (req, res) => {
  try {
    await userModel.unlockUser(Number(req.params.id));
    await userModel.logAudit({
      userId: req.user.id, username: req.user.username,
      action: 'UNLOCK_USER', target: req.params.id, ip: getIP(req),
    });
    res.json({ ok: true, message: '帳號已解除鎖定' });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// DELETE /api/admin/users/:id  ─  刪除帳號
router.delete('/users/:id', async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'self_delete', message: '不可刪除自己的帳號' });
  }
  try {
    const target = await userModel.findById(targetId);
    await userModel.deleteUser(targetId);
    await userModel.logAudit({
      userId: req.user.id, username: req.user.username,
      action: 'DELETE_USER', target: target?.username, ip: getIP(req),
    });
    res.json({ ok: true, message: '帳號已刪除' });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// GET /api/admin/login-logs  ─  登入記錄
router.get('/login-logs', async (req, res) => {
  try {
    const logs = await userModel.getLoginLogs(200);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// GET /api/admin/sync-logs  ─  同步記錄
router.get('/sync-logs', async (req, res) => {
  try {
    const logs = await crmModel.getSyncLogs(50);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

module.exports = router;
