import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, App, Spin } from 'antd';
import {
  UserOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  LoginOutlined,
  GithubOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useUserStore, useNotificationStore } from '../store';
import { api } from '../services/api';

const { Title, Text, Paragraph } = Typography;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useUserStore();
  const { fetchUnread } = useNotificationStore();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const redirect = new URLSearchParams(location.search).get('redirect') || '/dashboard';

  const quickAccounts = [
    { label: '管理员', user: 'admin', pwd: 'Admin@2024' },
    { label: '合规总监', user: 'director.wang', pwd: 'Compliance@2024' },
    { label: '合规专员', user: 'officer.li', pwd: 'Officer@2024' },
    { label: '法务', user: 'lawyer.zhang', pwd: 'Legal@2024' },
    { label: '审计', user: 'auditor.sun', pwd: 'Audit@2024' },
    { label: '观察员', user: 'viewer.zhao', pwd: 'Viewer@2024' },
  ];

  const handleLogin = async (values) => {
    setLoading(true);
    try {
      const res = await api.auth.login(values);
      login(res.token, res.user);
      fetchUnread(api);
      message.success(`欢迎回来，${res.user.fullName}！`);
      setTimeout(() => navigate(redirect), 300);
    } catch (err) {
      message.error(err.response?.data?.error || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const quickFill = (acc) => {
    const form = document.querySelector('form');
    if (form) {
      const userInput = document.querySelector('#username');
      const pwdInput = document.querySelector('#password');
      if (userInput) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(userInput, acc.user);
        userInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (pwdInput) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(pwdInput, acc.pwd);
        pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, opacity: 0.08 }}>
        <div style={{
          position: 'absolute', top: '-10%', left: '-5%',
          width: 500, height: 500, borderRadius: '50%',
          background: '#fff', filter: 'blur(80px)'
        }} />
        <div style={{
          position: 'absolute', bottom: '-15%', right: '-5%',
          width: 600, height: 600, borderRadius: '50%',
          background: '#4facfe', filter: 'blur(100px)'
        }} />
      </div>

      <div style={{
        display: 'flex', gap: 0, maxWidth: 1100, width: '100%',
        position: 'relative', zIndex: 1
      }}>
        <Card
          style={{
            flex: 1,
            display: 'none',
            '@media(min-width: 992px)': { display: 'flex', flexDirection: 'column' },
            borderRadius: '16px 0 0 16px',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            border: 'none',
            color: '#fff',
            padding: '40px 36px',
            justifyContent: 'space-between',
          }}
          bodyStyle={{ padding: 0, background: 'transparent', color: '#fff', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
          className="hide-on-mobile"
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 30 }}>
              <SafetyCertificateOutlined style={{ fontSize: 36, color: '#4facfe' }} />
              <Title level={3} style={{ color: '#fff', margin: 0 }}>合规监控系统</Title>
            </div>
            <Title level={2} style={{ color: '#fff', marginBottom: 16, fontWeight: 700 }}>
              企业级交易合规平台
            </Title>
            <Paragraph style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15, lineHeight: 1.8 }}>
              自动筛查多国制裁名单 · 智能风险评分引擎<br />
              24小时合规工单 · 超时自动升级<br />
              每日合规报告 · 完整审计追溯
            </Paragraph>
          </div>

          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              {[
                { label: '日均处理交易', value: '10万+' },
                { label: '覆盖制裁名单', value: '7大权威' },
                { label: '合规命中准确率', value: '99.5%' },
                { label: 'SLA达成率', value: '98%' },
              ].map((item, idx) => (
                <Card key={idx} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }} bodyStyle={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#4facfe' }}>{item.value}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{item.label}</div>
                </Card>
              ))}
            </div>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
              © 2024 Compliance Monitor System · 所有操作均被审计记录
            </Text>
          </div>
        </Card>

        <Card
          style={{
            flex: 1,
            borderRadius: 16,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            border: 'none',
          }}
          bodyStyle={{ padding: '36px 32px' }}
        >
          <div style={{ marginBottom: 28, textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <UserOutlined style={{ fontSize: 28, color: '#fff' }} />
            </div>
            <Title level={3} style={{ margin: '0 0 6px' }}>账户登录</Title>
            <Text type="secondary">登录合规监控管理系统</Text>
          </div>

          <Form
            layout="vertical"
            onFinish={handleLogin}
            size="large"
            initialValues={{ username: 'director.wang', password: 'Compliance@2024' }}
          >
            <Form.Item
              label="用户名"
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
              style={{ marginBottom: 16 }}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" />
            </Form.Item>

            <Form.Item style={{ marginBottom: 8 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                size="large"
                icon={<LoginOutlined />}
                loading={loading}
                style={{
                  height: 44,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                  fontSize: 15,
                  fontWeight: 600,
                }}
              >
                {loading ? '登录中...' : '登 录'}
              </Button>
            </Form.Item>
          </Form>

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px dashed #eee' }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 10 }}>💡 快速体验（点击即可填入）：</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {quickAccounts.map(acc => (
                <Button
                  key={acc.user}
                  size="small"
                  onClick={() => quickFill(acc)}
                  style={{ fontSize: 12 }}
                >
                  {acc.label}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
