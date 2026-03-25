const express = require('express');
const router = express.Router();
const userModel = require('./userModel');
const { generateToken, requireAuth, getIP } = require('./auth');

const LOCK_THRESHOLD = 5;

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const ip = getIP(req);

  if (!username || !password) {
    return res.status(400).json({
      error: 'missing_fields',
      message: '請輸入帳號與密碼',
    });
  }

  try {
    const user = await userModel.findByUsername(username);

    if (!user) {
      await userModel.logLogin({
        username,
        ip,
        status: 'failed',
        reason: 'user_not_found',
      });

      return res.status(401).json({
        error: 'invalid_credentials',
        message: '帳號或密碼錯誤',
      });
    }

    if (user.status === 'disabled') {
      await userModel.logLogin({
        userId: user.id,
        username,
        ip,
        status: 'failed',
        reason: 'account_disabled',
      });

      return res.status(403).json({
        error: 'account_disabled',
        message: '此帳號已停用，請聯絡管理員',
      });
    }

    if (await userModel.isLocked(user)) {
      await userModel.logLogin({
        userId: user.id,
        username,
        ip,
        status: 'locked',
        reason: 'account_locked',
      });

      const lockTime = user.locked_until
        ? new Date(user.locked_until).toLocaleString('zh-TW')
        : '稍後再試';

      return res.status(403).json({
        error: 'account_locked',
        message: `帳號已鎖定，請於 ${lockTime} 後再試`,
      });
    }

    const ok = await userModel.verifyPassword(user, password);
    if (!ok) {
      await userModel.onLoginFail(user.id);
      await userModel.logLogin({
        userId: user.id,
        username,
        ip,
        status: 'failed',
        reason: 'wrong_password',
      });

      const remaining = Math.max(0, LOCK_THRESHOLD - (user.failed_count + 1));
      const message = remaining > 0
        ? `帳號或密碼錯誤，還可再嘗試 ${remaining} 次`
        : '帳號或密碼錯誤，帳號已被鎖定';

      return res.status(401).json({
        error: 'invalid_credentials',
        message,
      });
    }

    await userModel.onLoginSuccess(user.id);
    await userModel.logLogin({
      userId: user.id,
      username,
      ip,
      status: 'success',
      reason: null,
    });
    await userModel.logAudit({
      userId: user.id,
      username,
      action: 'LOGIN',
      ip,
    });

    const token = generateToken(user);
    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({
      error: 'server_error',
      message: '登入時發生伺服器錯誤',
    });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  await userModel.logAudit({
    userId: req.user.id,
    username: req.user.username,
    action: 'LOGOUT',
    ip: getIP(req),
  });

  res.json({ ok: true, message: '已登出' });
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        error: 'not_found',
        message: '使用者不存在',
      });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { current, newPassword } = req.body;

  if (!current || !newPassword) {
    return res.status(400).json({
      error: 'missing_fields',
      message: '請輸入目前密碼與新密碼',
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      error: 'weak_password',
      message: '新密碼至少需要 8 個字元',
    });
  }

  try {
    const user = await userModel.findByUsername(req.user.username);
    const ok = await userModel.verifyPassword(user, current);

    if (!ok) {
      return res.status(401).json({
        error: 'wrong_password',
        message: '目前密碼錯誤',
      });
    }

    await userModel.changePassword(req.user.id, newPassword);
    await userModel.logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'CHANGE_PASSWORD',
      ip: getIP(req),
    });

    res.json({ ok: true, message: '密碼已更新' });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

module.exports = router;
