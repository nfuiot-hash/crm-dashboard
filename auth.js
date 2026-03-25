const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'change_this_secret';

function decodeToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  const payload = token ? decodeToken(token) : null;

  if (!payload) {
    return res.status(401).json({ error: 'unauthorized', message: '請先登入' });
  }

  req.user = payload;
  next();
}

function requireAdmin(req, res, next) {
  const token = extractToken(req);
  const payload = token ? decodeToken(token) : null;

  if (!payload) {
    return res.status(401).json({ error: 'unauthorized', message: '請先登入' });
  }

  if (payload.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden', message: '需要管理員權限' });
  }

  req.user = payload;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    const token = extractToken(req);
    const payload = token ? decodeToken(token) : null;

    if (!payload) {
      return res.status(401).json({ error: 'unauthorized', message: '請先登入' });
    }

    if (!roles.includes(payload.role)) {
      return res.status(403).json({ error: 'forbidden', message: '權限不足' });
    }

    req.user = payload;
    next();
  };
}

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    },
    SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '8h' }
  );
}

function getIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireRole,
  generateToken,
  getIP,
  decodeToken,
};
