const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');

const ROLE_PERMISSIONS = {
  ADMIN: ['*'],
  COMPLIANCE_DIRECTOR: [
    'transaction:view', 'transaction:freeze', 'transaction:release',
    'review:view', 'review:approve', 'review:reject', 'review:escalate', 'review:assign',
    'sanction:view', 'sanction:upload', 'sanction:manage',
    'report:view', 'report:generate', 'report:export',
    'supplier:view', 'supplier:update', 'supplier:block',
    'audit:view', 'audit:export',
    'dashboard:view',
    'notification:send',
    'user:view',
  ],
  COMPLIANCE_OFFICER: [
    'transaction:view',
    'review:view', 'review:approve', 'review:reject', 'review:assign',
    'sanction:view', 'sanction:upload',
    'report:view', 'report:export',
    'supplier:view',
    'audit:view',
    'dashboard:view',
  ],
  LEGAL_REVIEWER: [
    'transaction:view',
    'review:view', 'review:approve', 'review:reject',
    'sanction:view',
    'report:view',
    'supplier:view',
    'dashboard:view',
  ],
  AUDITOR: [
    'transaction:view',
    'review:view',
    'sanction:view',
    'report:view', 'report:export',
    'supplier:view',
    'audit:view', 'audit:export',
    'dashboard:view',
  ],
  VIEWER: [
    'transaction:view',
    'sanction:view',
    'report:view',
    'supplier:view',
    'dashboard:view',
  ],
};

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token && req.query?.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '令牌已过期' });
    }
    return res.status(403).json({ error: '无效的令牌' });
  }
}

function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '未认证' });
    }

    const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];

    if (userPermissions.includes('*')) {
      return next();
    }

    const hasAll = permissions.every(p => {
      if (userPermissions.includes(p)) return true;
      const [resource] = p.split(':');
      return userPermissions.includes(`${resource}:*`);
    });

    if (!hasAll) {
      logger.audit('权限拒绝', {
        userId: req.user.userId,
        requiredPermissions: permissions,
        action: req.method + ' ' + req.path,
      });
      return res.status(403).json({
        error: '权限不足',
        required: permissions,
      });
    }

    next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '未认证' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: '角色权限不足',
        required: roles,
      });
    }
    next();
  };
}

async function createAuditLog(options) {
  try {
    const log = new AuditLog({
      logId: uuidv4(),
      timestamp: new Date(),
      action: options.action,
      category: options.category || 'SYSTEM',
      severity: options.severity || 'INFO',
      userId: options.userId,
      userName: options.userName,
      userRole: options.userRole,
      entityType: options.entityType,
      entityId: options.entityId,
      entityRef: options.entityRef,
      description: options.description,
      details: options.details || {},
      changes: options.changes,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      relatedTransactionId: options.relatedTransactionId,
      relatedReviewId: options.relatedReviewId,
      status: options.status || 'SUCCESS',
      errorMessage: options.errorMessage,
    });
    await log.save();
    return log;
  } catch (err) {
    logger.error('审计日志保存失败:', err);
  }
}

function auditMiddleware(action, category = 'SYSTEM') {
  return async (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;

    res.send = function(body) {
      const duration = Date.now() - startTime;
      const user = req.user || {};
      const status = res.statusCode < 400 ? 'SUCCESS' : 'FAILURE';

      createAuditLog({
        action,
        category,
        severity: res.statusCode >= 500 ? 'ERROR' : (res.statusCode >= 400 ? 'WARNING' : 'INFO'),
        userId: user.userId,
        userName: user.username,
        userRole: user.role,
        description: `${req.method} ${req.originalUrl} - ${status} (${duration}ms)`,
        details: {
          method: req.method,
          url: req.originalUrl,
          params: req.params,
          query: req.query,
          body: Object.keys(req.body || {}).length > 50
            ? { _truncated: true, keys: Object.keys(req.body) }
            : req.body,
          responseSize: typeof body === 'string' ? body.length : 0,
          durationMs: duration,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        entityType: category,
        status,
        errorMessage: status === 'FAILURE' ? (res.statusMessage || '请求失败') : undefined,
      }).catch(err => logger.error('审计中间件错误:', err));

      return originalSend.call(this, body);
    };

    next();
  };
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

async function getUserFromToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return await User.findOne({ userId: decoded.userId, isActive: true });
  } catch {
    return null;
  }
}

module.exports = {
  authenticateToken,
  requirePermission,
  requireRole,
  createAuditLog,
  auditMiddleware,
  asyncHandler,
  getUserFromToken,
  ROLE_PERMISSIONS,
};
