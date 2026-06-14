import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, Tooltip, Divider, theme, App } from 'antd';
import {
  DashboardOutlined,
  SwapOutlined,
  FileSearchOutlined,
  SafetyCertificateOutlined,
  UploadOutlined,
  TeamOutlined,
  BarChartOutlined,
  FileTextOutlined,
  BellOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ExclamationCircleOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useUserStore, useUIStore, useNotificationStore } from '../store';
import { api } from '../services/api';

const { Header, Sider, Content } = Layout;

const menuItems = (permissions = []) => {
  const has = (p) => permissions.includes('*') || permissions.includes(p) || permissions.includes(p.split(':')[0] + ':*');
  const items = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '总览仪表盘', show: has('dashboard:view') },
    { key: '/transactions', icon: <SwapOutlined />, label: '交易监控', show: has('transaction:view') },
    { key: '/reviews', icon: <FileSearchOutlined />, label: '合规工单', show: has('review:view') },
    {
      key: 'sanctions-group',
      icon: <SafetyCertificateOutlined />,
      label: '制裁名单',
      show: has('sanction:view'),
      children: [
        { key: '/sanctions', icon: <SafetyCertificateOutlined />, label: '名单条目', show: has('sanction:view') },
        { key: '/sanctions/uploads', icon: <UploadOutlined />, label: '上传记录', show: has('sanction:upload') },
      ],
    },
    { key: '/suppliers', icon: <TeamOutlined />, label: '供应商管理', show: has('supplier:view') },
    { key: '/reports', icon: <BarChartOutlined />, label: '统计报告', show: has('report:view') },
    { key: '/audit', icon: <FileTextOutlined />, label: '审计日志', show: has('audit:view') },
    { key: '/notifications', icon: <BellOutlined />, label: '通知中心', show: true },
    { key: '/settings', icon: <SettingOutlined />, label: '系统设置', show: true },
  ];
  const filterVisible = (arr) =>
    arr
      .filter(i => i.show !== false)
      .map(i => ({
        ...i,
        ...(i.children ? { children: filterVisible(i.children) } : {}),
      }));
  return filterVisible(items);
};

const ROLE_LABELS = {
  ADMIN: { label: '系统管理员', color: 'purple' },
  COMPLIANCE_DIRECTOR: { label: '合规总监', color: 'red' },
  COMPLIANCE_OFFICER: { label: '合规专员', color: 'orange' },
  LEGAL_REVIEWER: { label: '法务审查', color: 'blue' },
  AUDITOR: { label: '审计员', color: 'cyan' },
  VIEWER: { label: '观察员', color: 'green' },
};

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, permissions, logout } = useUserStore();
  const { collapsed, toggleSidebar } = useUIStore();
  const { unread, urgent, fetchUnread } = useNotificationStore();
  const { message } = App.useApp();
  const { token: themeToken } = theme.useToken();

  const [selectedKeys, setSelectedKeys] = useState(['/dashboard']);
  const [openKeys, setOpenKeys] = useState([]);

  useEffect(() => {
    setSelectedKeys([location.pathname]);
    if (location.pathname.startsWith('/sanctions')) {
      setOpenKeys(['sanctions-group']);
    }
  }, [location.pathname]);

  useEffect(() => {
    fetchUnread(api);
    const t = setInterval(() => fetchUnread(api), 60000);
    return () => clearInterval(t);
  }, []);

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch { /* ignore */ }
    logout();
    message.success('已退出登录');
    navigate('/login');
  };

  const roleConfig = ROLE_LABELS[user?.role] || { label: '用户', color: 'default' };

  const userMenu = (
    <Menu>
      <Menu.Item key="profile" icon={<UserOutlined />}>
        <div style={{ padding: '4px 0' }}>
          <div style={{ fontWeight: 600 }}>{user?.fullName}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{user?.username} · {roleConfig.label}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{user?.email}</div>
        </div>
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="settings" icon={<ToolOutlined />} onClick={() => navigate('/settings')}>
        账户设置
      </Menu.Item>
      <Menu.Item key="logout" icon={<LogoutOutlined />} onClick={handleLogout} danger>
        退出登录
      </Menu.Item>
    </Menu>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={230}
        style={{
          background: '#001529',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? 0 : '0 16px',
            color: '#fff',
            fontSize: collapsed ? 14 : 16,
            fontWeight: 600,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <span style={{ fontSize: 22, marginRight: collapsed ? 0 : 10 }}>🛡️</span>
          {!collapsed && '合规监控系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKeys}
          openKeys={openKeys}
          onOpenChange={setOpenKeys}
          style={{ borderRight: 0, marginTop: 8 }}
          items={menuItems(permissions)}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 16px',
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0,21,41,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={toggleSidebar}
              style={{ fontSize: 16, width: 40, height: 40 }}
            />
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              {menuItems(permissions).flatMap(m => m.children || [m]).find(m => m.key === location.pathname)?.label || '合规监控系统'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Tooltip title="通知中心">
              <Badge count={unread} overflowCount={99} size="small" offset={[-2, 2]}>
                <Button
                  type="text"
                  icon={urgent > 0
                    ? <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                    : <BellOutlined />}
                  onClick={() => navigate('/notifications')}
                  style={{ width: 40, height: 40 }}
                />
              </Badge>
            </Tooltip>
            <Divider type="vertical" style={{ height: 24 }} />
            <Dropdown overlay={userMenu} placement="bottomRight" trigger={['click']}>
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
                <Avatar
                  style={{ backgroundColor: themeToken.colorPrimary, verticalAlign: 'middle' }}
                  icon={<UserOutlined />}
                  size="default"
                >
                  {user?.fullName?.charAt(0)}
                </Avatar>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{user?.fullName}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{roleConfig.label}</div>
                </div>
              </div>
            </Dropdown>
          </div>
        </Header>
        <Content style={{ margin: 0, padding: 16, background: '#f5f7fa' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
