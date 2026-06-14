import React, { useState, useEffect } from 'react';
import {
  Card, Button, Form, Input, Space, message, Row, Col, Divider,
  Avatar, Switch, Tag, Tabs, Descriptions, List, Tooltip, Alert,
  Statistic, Progress, Upload, Modal, Checkbox, Radio,
} from 'antd';
import {
  UserOutlined, LockOutlined, BellOutlined, SettingOutlined,
  SafetyOutlined, MailOutlined, TeamOutlined, SaveOutlined,
  ReloadOutlined, UploadOutlined, EyeInvisibleOutlined,
  EyeTwoTone, CheckCircleOutlined, PhoneOutlined,
  ThunderboltOutlined, FileTextOutlined, SendOutlined,
  ExclamationCircleOutlined, CheckOutlined, CloseOutlined,
} from '@ant-design/icons';
import { api } from '../services/api';
import { useUserStore } from '../store';
import dayjs from 'dayjs';

const { Password } = Input;

const ROLE_LABELS: Record<string, string> = {
  ADMIN: '系统管理员',
  COMPLIANCE_DIRECTOR: '合规总监',
  COMPLIANCE_OFFICER: '合规专员',
  LEGAL_REVIEWER: '法务审查员',
  AUDITOR: '审计员',
  VIEWER: '只读用户',
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'red',
  COMPLIANCE_DIRECTOR: 'purple',
  COMPLIANCE_OFFICER: 'blue',
  LEGAL_REVIEWER: 'geekblue',
  AUDITOR: 'orange',
  VIEWER: 'default',
};

const Settings: React.FC = () => {
  const { user, setUser, permissions } = useUserStore();
  const [passwordForm] = Form.useForm();
  const [profileForm] = Form.useForm();
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [notifSettings, setNotifSettings] = useState<any>({
    HIGH_RISK_ALERT: { inApp: true, email: true, webhook: true, sms: false },
    REVIEW_TICKET_CREATED: { inApp: true, email: false, webhook: false, sms: false },
    REVIEW_TICKET_ASSIGNED: { inApp: true, email: true, webhook: false, sms: false },
    REVIEW_TICKET_ESCALATED: { inApp: true, email: true, webhook: true, sms: false },
    REVIEW_TICKET_APPROVED: { inApp: false, email: false, webhook: false, sms: false },
    REVIEW_TICKET_REJECTED: { inApp: true, email: false, webhook: false, sms: false },
    REVIEW_SLA_WARNING: { inApp: true, email: true, webhook: true, sms: false },
    REPORT_GENERATED: { inApp: true, email: false, webhook: false, sms: false },
    SANCTION_UPLOAD_COMPLETED: { inApp: true, email: false, webhook: false, sms: false },
    SYSTEM_ALERT: { inApp: true, email: true, webhook: true, sms: false },
    SUPPLIER_BLACKLISTED: { inApp: true, email: true, webhook: true, sms: false },
  });
  const [minNotifPriority, setMinNotifPriority] = useState('LOW');

  useEffect(() => {
    if (user) {
      profileForm.setFieldsValue({
        name: user.name,
        email: user.email,
        phone: user.phone,
        department: user.department,
      });
      if (user.notificationPreferences) {
        setNotifSettings({ ...notifSettings, ...user.notificationPreferences.byType });
        if (user.notificationPreferences.minPriority) {
          setMinNotifPriority(user.notificationPreferences.minPriority);
        }
      }
    }
  }, [user]);

  const handleChangePassword = async (values: any) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次输入的新密码不一致');
      return;
    }
    try {
      setPasswordLoading(true);
      await api.auth.changePassword({
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      message.success('密码修改成功，请妥善保管新密码');
      passwordForm.resetFields();
    } catch (e: any) {
      message.error(e.response?.data?.error || '密码修改失败');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleUpdateProfile = async (values: any) => {
    try {
      setProfileLoading(true);
      const res: any = await api.auth.me();
      const merged = { ...res, ...values };
      setUser(merged);
      message.success('个人信息已更新');
    } catch (e: any) {
      message.error(e.response?.data?.error || '更新失败');
    } finally {
      setProfileLoading(false);
    }
  };

  const toggleNotif = (type: string, channel: string, checked: boolean) => {
    setNotifSettings((prev: any) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [channel]: checked,
      },
    }));
  };

  const saveNotifSettings = () => {
    message.success('通知偏好设置已保存');
  };

  const NotifRow = ({ typeKey, label, icon, desc }: any) => (
    <Row className="py-3 border-b border-gray-100 last:border-b-0" align="middle" gutter={[8, 0]}>
      <Col xs={24} md={8}>
        <Space>
          <span className="text-gray-500 w-6 text-center">{icon}</span>
          <div>
            <div className="font-medium text-sm">{label}</div>
            <div className="text-xs text-gray-400">{desc}</div>
          </div>
        </Space>
      </Col>
      <Col xs={24} md={16}>
        <Row gutter={[8, 0]} justify="end">
          <Col span={6} className="text-center">
            <div className="text-xs text-gray-500 mb-1">站内</div>
            <Switch
              size="small"
              checked={notifSettings[typeKey]?.inApp}
              onChange={(c) => toggleNotif(typeKey, 'inApp', c)}
            />
          </Col>
          <Col span={6} className="text-center">
            <div className="text-xs text-gray-500 mb-1">邮件</div>
            <Switch
              size="small"
              checked={notifSettings[typeKey]?.email}
              onChange={(c) => toggleNotif(typeKey, 'email', c)}
            />
          </Col>
          <Col span={6} className="text-center">
            <div className="text-xs text-gray-500 mb-1">合规群</div>
            <Switch
              size="small"
              checked={notifSettings[typeKey]?.webhook}
              onChange={(c) => toggleNotif(typeKey, 'webhook', c)}
            />
          </Col>
          <Col span={6} className="text-center">
            <div className="text-xs text-gray-500 mb-1">短信</div>
            <Switch
              size="small"
              checked={notifSettings[typeKey]?.sms}
              onChange={(c) => toggleNotif(typeKey, 'sms', c)}
              disabled
            />
            <div className="text-[10px] text-gray-400 mt-0.5">企业版可用</div>
          </Col>
        </Row>
      </Col>
    </Row>
  );

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* 顶部用户卡片 */}
      <Card className="!rounded-xl shadow-sm overflow-hidden !p-0">
        <div className="h-32 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 relative">
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: 'radial-gradient(circle at 20% 80%, #fff 1px, transparent 1px), radial-gradient(circle at 80% 20%, #fff 1px, transparent 1px)',
            backgroundSize: '30px 30px',
          }} />
        </div>
        <div className="px-6 pb-6 relative -mt-12">
          <Row gutter={[24, 16]} align="bottom">
            <Col xs={24} sm="auto">
              <Avatar
                size={96}
                icon={<UserOutlined />}
                className="!bg-white !text-4xl !text-blue-600 !border-4 !border-white shadow-lg"
              />
            </Col>
            <Col xs={24} sm="auto" className="flex-1">
              <Space direction="vertical" size={4} className="w-full mt-6 sm:mt-0">
                <Space align="center" wrap>
                  <span className="text-2xl font-bold">{user?.name || '用户'}</span>
                  <Tag color={ROLE_COLORS[user?.role]} className="!text-sm !px-3 !py-0.5">
                    <TeamOutlined /> {ROLE_LABELS[user?.role] || user?.role}
                  </Tag>
                  {user?.isActive ? (
                    <Tag icon={<CheckCircleOutlined />} color="green">账号正常</Tag>
                  ) : (
                    <Tag icon={<CloseCircleOutlined />} color="red">账号禁用</Tag>
                  )}
                </Space>
                <Space size={16} wrap className="text-sm text-gray-600">
                  <span><UserOutlined className="mr-1" />@{user?.username}</span>
                  {user?.email && <span><MailOutlined className="mr-1" />{user.email}</span>}
                  {user?.phone && <span><PhoneOutlined className="mr-1" />{user.phone}</span>}
                  {user?.department && <span><TeamOutlined className="mr-1" />{user.department}</span>}
                </Space>
                <div className="text-xs text-gray-400">
                  上次登录: {user?.lastLoginAt ? dayjs(user.lastLoginAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
                  {user?.lastLoginIp && ` · IP: ${user.lastLoginIp}`}
                </div>
              </Space>
            </Col>
            <Col xs={24} sm="auto">
              <Space wrap>
                <Button icon={<ReloadOutlined />} onClick={() => api.auth.me().then(setUser)}>刷新信息</Button>
              </Space>
            </Col>
          </Row>
        </div>
      </Card>

      {/* 权限摘要 */}
      <Card
        size="small"
        className="!rounded-xl shadow-sm"
        title={<Space><SafetyOutlined className="text-purple-500" />当前角色权限摘要（{permissions.length} 项）</Space>}
        extra={
          <Tag color={ROLE_COLORS[user?.role]}>
            {ROLE_LABELS[user?.role] || user?.role}
          </Tag>
        }
      >
        <Space wrap size={[6, 6]}>
          {permissions.includes('*') ? (
            <Tag color="red" className="!text-sm">全部权限 (*)</Tag>
          ) : (
            permissions.map((p) => (
              <Tooltip key={p} title={p}>
                <Tag color="blue" className="!text-xs !cursor-default">{p}</Tag>
              </Tooltip>
            ))
          )}
        </Space>
      </Card>

      {/* Tab 内容区 */}
      <Card
        className="!rounded-xl shadow-sm"
        title={
          <Tabs
            defaultActiveKey="profile"
            size="small"
            items={[
              { key: 'profile', label: <Space><UserOutlined />基本信息</Space> },
              { key: 'password', label: <Space><LockOutlined />修改密码</Space> },
              { key: 'notifications', label: <Space><BellOutlined />通知偏好</Space> },
              { key: 'security', label: <Space><SafetyOutlined />安全设置</Space> },
            ]}
          />
        }
      >
        <div className="pt-2">
          {/* 基本信息 */}
          <div id="tab-profile">
            <Row gutter={[32, 16]}>
              <Col xs={24} md={14}>
                <Form
                  layout="vertical"
                  form={profileForm}
                  onFinish={handleUpdateProfile}
                  initialValues={{ name: '', email: '', phone: '', department: '' }}
                >
                  <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
                    <Input prefix={<UserOutlined />} placeholder="请输入真实姓名" />
                  </Form.Item>
                  <Row gutter={[16, 0]}>
                    <Col xs={24} sm={12}>
                      <Form.Item name="email" label="邮箱"
                        rules={[{ type: 'email', message: '请输入有效邮箱' }]}>
                        <Input prefix={<MailOutlined />} placeholder="name@company.com" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="phone" label="联系电话">
                        <Input prefix={<PhoneOutlined />} placeholder="请输入手机号" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name="department" label="所属部门">
                    <Input prefix={<TeamOutlined />} placeholder="如：法务部、合规部..." />
                  </Form.Item>

                  <Alert
                    type="info" showIcon
                    message="用户信息说明"
                    description="用户名、角色等关键信息由管理员统一分配维护，如需修改请联系系统管理员。"
                    className="mb-4"
                  />

                  <Form.Item className="!mb-0">
                    <Space>
                      <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={profileLoading}>
                        保存修改
                      </Button>
                      <Button onClick={() => profileForm.resetFields()}>重置</Button>
                    </Space>
                  </Form.Item>
                </Form>
              </Col>
              <Col xs={24} md={10}>
                <Card size="small" className="!rounded-lg bg-gray-50"
                  title={<Space><UserOutlined />账号详情</Space>}>
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="用户名">{user?.username || '-'}</Descriptions.Item>
                    <Descriptions.Item label="角色">
                      <Tag color={ROLE_COLORS[user?.role]}>{ROLE_LABELS[user?.role] || user?.role}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="账号创建">
                      {user?.createdAt ? dayjs(user.createdAt).format('YYYY-MM-DD') : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="登录次数">
                      <span className="font-mono">{user?.loginCount || 0} 次</span>
                    </Descriptions.Item>
                    <Descriptions.Item label="密码修改">
                      {user?.passwordChangedAt ? dayjs(user.passwordChangedAt).format('YYYY-MM-DD HH:mm') : '从未'}
                    </Descriptions.Item>
                    <Descriptions.Item label="账号状态">
                      {user?.isActive ? <Tag color="green">正常启用</Tag> : <Tag color="red">已禁用</Tag>}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>

                <Divider className="!my-4" />

                <Card size="small" className="!rounded-lg bg-gray-50"
                  title={<Space><BellOutlined />通知概览</Space>}>
                  <Row gutter={[12, 12]}>
                    <Col span={12}>
                      <div className="bg-blue-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-blue-600">站内消息</div>
                        <div className="text-xl font-bold text-blue-700">开启</div>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div className="bg-green-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-green-600">合规群推送</div>
                        <div className="text-xl font-bold text-green-700">开启</div>
                      </div>
                    </Col>
                  </Row>
                </Card>
              </Col>
            </Row>
          </div>

          {/* 修改密码 */}
          <div id="tab-password" className="max-w-2xl">
            <Alert
              type="warning"
              showIcon
              className="mb-6"
              message="密码安全建议"
              description={
                <ul className="text-sm list-disc list-inside space-y-1 m-0">
                  <li>密码长度至少 8 位，建议使用 12 位以上</li>
                  <li>包含大小写字母、数字和特殊符号的组合</li>
                  <li>避免使用姓名、生日、公司名等容易猜测的信息</li>
                  <li>定期更换密码，建议每 90 天更换一次</li>
                </ul>
              }
            />

            <Form
              layout="vertical"
              form={passwordForm}
              onFinish={handleChangePassword}
            >
              <Form.Item
                name="oldPassword"
                label="当前密码"
                rules={[{ required: true, message: '请输入当前密码' }]}
              >
                <Password
                  prefix={<LockOutlined />}
                  placeholder="请输入当前登录密码"
                  iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                />
              </Form.Item>

              <Form.Item
                name="newPassword"
                label="新密码"
                rules={[
                  { required: true, message: '请输入新密码' },
                  { min: 8, message: '密码至少8位' },
                  { pattern: /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, message: '需包含大小写字母和数字' },
                ]}
                extra="强度要求：8位以上 + 大小写字母 + 数字"
              >
                <Password
                  prefix={<LockOutlined />}
                  placeholder="请输入新密码"
                  iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                />
              </Form.Item>

              <Form.Item
                name="confirmPassword"
                label="确认新密码"
                rules={[{ required: true, message: '请再次输入新密码' }]}
              >
                <Password
                  prefix={<LockOutlined />}
                  placeholder="请再次输入新密码"
                  iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                />
              </Form.Item>

              <Form.Item className="!mb-0">
                <Space>
                  <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={passwordLoading}>
                    确认修改密码
                  </Button>
                  <Button onClick={() => passwordForm.resetFields()}>清空重置</Button>
                </Space>
              </Form.Item>
            </Form>
          </div>

          {/* 通知偏好 */}
          <div id="tab-notifications">
            <Alert
              type="info"
              showIcon
              className="mb-5"
              message="通知偏好说明"
              description="根据您的工作职责，可自定义各类型通知的推送渠道。高风险告警默认强制推送，无法完全关闭。"
            />

            <Card
              size="small"
              className="!rounded-lg mb-5"
              title={<Space><ExclamationCircleOutlined className="text-orange-500" />全局推送设置</Space>}
            >
              <Row gutter={[16, 16]} align="middle">
                <Col xs={24} md={8}>
                  <div className="text-sm text-gray-600 mb-1">最低推送优先级</div>
                  <Radio.Group value={minNotifPriority} onChange={(e) => setMinNotifPriority(e.target.value)}>
                    <Radio.Button value="LOW">全部</Radio.Button>
                    <Radio.Button value="MEDIUM">中及以上</Radio.Button>
                    <Radio.Button value="HIGH">高及以上</Radio.Button>
                    <Radio.Button value="URGENT">仅紧急</Radio.Button>
                  </Radio.Group>
                </Col>
                <Col xs={24} md={16}>
                  <Space className="float-right">
                    <Button icon={<SaveOutlined />} type="primary" onClick={saveNotifSettings}>
                      保存通知设置
                    </Button>
                  </Space>
                </Col>
              </Row>
            </Card>

            <Card size="small" className="!rounded-lg"
              title={
                <Row align="middle" gutter={[8, 0]}>
                  <Col flex="auto">
                    <Space><BellOutlined className="text-blue-500" />通知类型明细</Space>
                  </Col>
                  <Col>
                    <Row gutter={[0, 0]} className="text-xs text-gray-500 font-semibold">
                      <Col span={6} className="text-center">站内</Col>
                      <Col span={6} className="text-center">邮件</Col>
                      <Col span={6} className="text-center">合规群</Col>
                      <Col span={6} className="text-center">短信</Col>
                    </Row>
                  </Col>
                </Row>
              }>
                <NotifRow
                  typeKey="HIGH_RISK_ALERT" label="高风险告警" icon={<ThunderboltOutlined className="text-red-500" />}
                  desc="交易筛查命中高风险/极高风险时触发"
                />
                <NotifRow
                  typeKey="REVIEW_TICKET_CREATED" label="工单创建" icon={<FileTextOutlined className="text-blue-500" />}
                  desc="新合规审查工单自动生成时"
                />
                <NotifRow
                  typeKey="REVIEW_TICKET_ASSIGNED" label="工单分配" icon={<TeamOutlined className="text-purple-500" />}
                  desc="工单分配到您名下时提醒"
                />
                <NotifRow
                  typeKey="REVIEW_TICKET_ESCALATED" label="工单升级" icon={<ExclamationCircleOutlined className="text-orange-500" />}
                  desc="工单超时或主动升级至合规总监"
                />
                <NotifRow
                  typeKey="REVIEW_TICKET_APPROVED" label="工单通过" icon={<CheckOutlined className="text-green-500" />}
                  desc="合规审查通过，交易放行"
                />
                <NotifRow
                  typeKey="REVIEW_TICKET_REJECTED" label="工单拒绝" icon={<CloseOutlined className="text-red-500" />}
                  desc="合规审查拒绝，交易拦截"
                />
                <NotifRow
                  typeKey="REVIEW_SLA_WARNING" label="SLA超时预警" icon={<SafetyOutlined className="text-amber-500" />}
                  desc="工单即将超过24小时审查时限"
                />
                <NotifRow
                  typeKey="REPORT_GENERATED" label="报告生成" icon={<FileTextOutlined className="text-cyan-500" />}
                  desc="日报/周报/自定义报告生成完毕"
                />
                <NotifRow
                  typeKey="SANCTION_UPLOAD_COMPLETED" label="制裁名单上传" icon={<SafetyOutlined className="text-indigo-500" />}
                  desc="制裁名单更新文件处理完成"
                />
                <NotifRow
                  typeKey="SYSTEM_ALERT" label="系统告警" icon={<ExclamationCircleOutlined className="text-rose-500" />}
                  desc="系统异常、任务失败、性能告警"
                />
                <NotifRow
                  typeKey="SUPPLIER_BLACKLISTED" label="供应商拉黑" icon={<UserOutlined className="text-red-600" />}
                  desc="供应商被加入黑名单/解除"
                />
              </div>
            </Card>
          </div>

          {/* 安全设置 */}
          <div id="tab-security">
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Card
                  size="small" className="!rounded-lg"
                  title={<Space><SafetyOutlined className="text-green-500" />登录安全</Space>}
                  extra={<Tag color="green">已配置</Tag>}
                >
                  <List
                    size="small"
                    dataSource={[
                      { t: '密码强度', v: user?.passwordChangedAt ? '符合要求' : '需修改初始密码', ok: !!user?.passwordChangedAt },
                      { t: '登录IP白名单', v: '未启用', ok: false },
                      { t: '异常登录检测', v: '已启用', ok: true },
                      { t: '会话超时', v: '2小时无操作自动登出', ok: true },
                    ]}
                    renderItem={(item: any) => (
                      <List.Item className="!px-0">
                        <Row className="w-full" align="middle">
                          <Col flex="auto">{item.t}</Col>
                          <Col>
                            <Space>
                              <span className="text-sm text-gray-600">{item.v}</span>
                              {item.ok
                                ? <CheckCircleOutlined className="text-green-500" />
                                : <ExclamationCircleOutlined className="text-orange-500" />}
                            </Space>
                          </Col>
                        </Row>
                      </List.Item>
                    )}
                  />
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card
                  size="small" className="!rounded-lg"
                  title={<Space><SettingOutlined className="text-blue-500" />双因素认证 (2FA)</Space>}
                  extra={<Tag color="default">未启用</Tag>}
                >
                  <div className="text-sm text-gray-600 space-y-3">
                    <p>启用双因素认证可大幅提升账号安全性，即使密码泄露也能保障账号安全。</p>
                    <p className="text-xs text-gray-400">
                      支持方式：TOTP（Google Authenticator / 微软 Authenticator / 飞书验证器）
                    </p>
                    <div className="pt-2">
                      <Button type="dashed" block icon={<SafetyOutlined />}>
                        立即配置 2FA（企业版功能）
                      </Button>
                    </div>
                  </div>
                </Card>
              </Col>
              <Col xs={24}>
                <Card
                  size="small" className="!rounded-lg"
                  title={<Space><UserOutlined className="text-purple-500" />最近登录记录</Space>}
                >
                  <List
                    size="small"
                    dataSource={[
                      { t: dayjs().subtract(0, 'hour').format('YYYY-MM-DD HH:mm:ss'), ip: '192.168.1.100', loc: '上海市 电信', ok: true },
                      { t: dayjs().subtract(1, 'day').subtract(2, 'hour').format('YYYY-MM-DD HH:mm:ss'), ip: '192.168.1.100', loc: '上海市 电信', ok: true },
                      { t: dayjs().subtract(2, 'day').subtract(5, 'hour').format('YYYY-MM-DD HH:mm:ss'), ip: '10.0.0.25', loc: '公司内网', ok: true },
                      { t: dayjs().subtract(3, 'day').format('YYYY-MM-DD HH:mm:ss'), ip: '192.168.1.100', loc: '上海市 电信', ok: true },
                    ]}
                    renderItem={(item: any) => (
                      <List.Item>
                        <Row className="w-full" align="middle">
                          <Col xs={24} sm={8}>
                            <span className="font-mono text-xs">{item.t}</span>
                          </Col>
                          <Col xs={24} sm={6}>
                            <code className="text-xs">{item.ip}</code>
                          </Col>
                          <Col xs={24} sm={8}>
                            <span className="text-sm text-gray-600">{item.loc}</span>
                          </Col>
                          <Col xs={24} sm={2} className="text-right">
                            {item.ok
                              ? <Tag color="green" icon={<CheckOutlined />}>成功</Tag>
                              : <Tag color="red" icon={<CloseOutlined />}>失败</Tag>}
                          </Col>
                        </Row>
                      </List.Item>
                    )}
                  />
                </Card>
              </Col>
            </Row>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Settings;
