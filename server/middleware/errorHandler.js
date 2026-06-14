const logger = require('../config/logger');
const { createAuditLog } = require('../middleware/auth');

function notFound(req, res, next) {
  res.status(404).json({
    error: '资源未找到',
    path: req.originalPath,
    method: req.method,
  });
}

function errorHandler(err, req, res, next) {
  logger.error('错误处理器:', {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    userId: req.user?.userId,
  });

  createAuditLog({
    action: 'ERROR_HANDLER',
    category: 'SYSTEM',
    severity: err.statusCode >= 500 ? 'ERROR' : 'WARNING',
    userId: req.user?.userId,
    description: `系统错误: ${err.message}`,
    details: {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      path: req.originalUrl,
      method: req.method,
    },
    status: 'FAILURE',
    errorMessage: err.message,
  }).catch(() => {});

  if (err.name === 'ValidationError') {
    const errors = {};
    Object.keys(err.errors).forEach(key => {
      errors[key] = err.errors[key].message;
    });
    return res.status(400).json({
      error: '数据验证失败',
      validationErrors: errors,
    });
  }

  if (err.name === 'MongoServerError' && err.code === 11000) {
    const key = Object.keys(err.keyPattern || {})[0];
    return res.status(409).json({
      error: '数据冲突',
      message: key ? `${key} 已存在` : '重复数据',
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: '认证失败',
      message: '无效的访问令牌',
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: '请求体解析失败',
      message: '无效的JSON格式',
    });
  }

  const statusCode = err.statusCode || err.status || 500;

  res.status(statusCode).json({
    error: err.message || '服务器内部错误',
    code: err.code,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
    }),
  });
}

class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(message = '资源未找到', code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

class BadRequestError extends AppError {
  constructor(message = '请求参数错误', code = 'BAD_REQUEST') {
    super(message, 400, code);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = '未授权访问', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

class ForbiddenError extends AppError {
  constructor(message = '权限不足', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

class ConflictError extends AppError {
  constructor(message = '数据冲突', code = 'CONFLICT') {
    super(message, 409, code);
  }
}

module.exports = {
  errorHandler,
  notFound,
  AppError,
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
};
