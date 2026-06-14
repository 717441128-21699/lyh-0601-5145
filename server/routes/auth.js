const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { asyncHandler, createAuditLog, ROLE_PERMISSIONS } = require('../middleware/auth');
const { BadRequestError, UnauthorizedError, NotFoundError } = require('../middleware/errorHandler');
const logger = require('../config/logger');

const router = express.Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    throw new BadRequestError('用户名和密码不能为空');
  }

  const user = await User.findOne({ username });
  if (!user) {
    throw new UnauthorizedError('用户名或密码错误');
  }

  if (!user.isActive || user.isLocked) {
    throw new UnauthorizedError('账户已被禁用或锁定');
  }

  const isValid = await user.comparePassword(password);
  if (!isValid) {
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();
    await createAuditLog({
      action: 'LOGIN_FAILED',
      category: 'AUTH',
      severity: 'WARNING',
      userId: user.userId,
      userName: username,
      userRole: user.role,
      description: `用户 ${username} 登录失败 (密码错误)`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'FAILURE',
    });
    throw new UnauthorizedError('用户名或密码错误');
  }

  user.lastLoginAt = new Date();
  user.lastLoginIp = req.ip;
  user.loginCount = (user.loginCount || 0) + 1;
  await user.save();

  const token = jwt.sign(
    {
      userId: user.userId,
      username: user.username,
      role: user.role,
      fullName: user.fullName,
      department: user.department,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  await createAuditLog({
    action: 'LOGIN_SUCCESS',
    category: 'AUTH',
    severity: 'INFO',
    userId: user.userId,
    userName: username,
    userRole: user.role,
    description: `用户 ${username} 登录成功`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  const allPermissions = ROLE_PERMISSIONS[user.role] || [];

  res.json({
    token,
    user: {
      userId: user.userId,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      department: user.department,
      permissions: allPermissions,
    },
    expiresIn: 24 * 60 * 60,
  });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  let userInfo = null;

  if (token) {
    try {
      userInfo = jwt.verify(token, process.env.JWT_SECRET);
    } catch { /* ignore */ }
  }

  if (userInfo) {
    await createAuditLog({
      action: 'LOGOUT',
      category: 'AUTH',
      severity: 'INFO',
      userId: userInfo.userId,
      userName: userInfo.username,
      userRole: userInfo.role,
      description: `用户 ${userInfo.username} 登出`,
      ipAddress: req.ip,
    });
  }

  res.json({ success: true });
}));

router.get('/me', asyncHandler(async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    throw new UnauthorizedError('未提供认证令牌');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw new UnauthorizedError('令牌无效或已过期');
  }

  const user = await User.findOne({ userId: decoded.userId });
  if (!user) {
    throw new NotFoundError('用户不存在');
  }

  const allPermissions = ROLE_PERMISSIONS[user.role] || [];

  res.json({
    userId: user.userId,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    department: user.department,
    permissions: allPermissions,
    isActive: user.isActive,
    notificationPreferences: user.notificationPreferences,
    assignedTicketCount: user.assignedTicketCount || 0,
    completedTicketCount: user.completedTicketCount || 0,
  });
}));

router.put('/change-password', asyncHandler(async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) throw new UnauthorizedError('未认证');
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    throw new BadRequestError('原密码和新密码不能为空');
  }
  if (newPassword.length < 8) {
    throw new BadRequestError('新密码长度至少8位');
  }

  const user = await User.findOne({ userId: decoded.userId });
  if (!user) throw new NotFoundError('用户不存在');

  const isValid = await user.comparePassword(oldPassword);
  if (!isValid) {
    throw new BadRequestError('原密码错误');
  }

  user.passwordHash = await User.hashPassword(newPassword);
  await user.save();

  await createAuditLog({
    action: 'PASSWORD_CHANGED',
    category: 'AUTH',
    severity: 'WARNING',
    userId: user.userId,
    userName: user.username,
    userRole: user.role,
    description: '用户修改密码',
    ipAddress: req.ip,
  });

  res.json({ success: true, message: '密码修改成功' });
}));

module.exports = router;
