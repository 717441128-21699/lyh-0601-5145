import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, Table, Button, Select, Space, Tag, Drawer, Descriptions,
  message, Spin, Empty, Row, Col, Statistic, Badge, List, Avatar,
  Divider, Modal, Form, Input, Tabs, Switch, Tooltip, Alert, Checkbox,
} from 'antd';
import {
  BellOutlined, CheckOutlined, ExclamationCircleOutlined,
  ThunderboltOutlined, InfoCircleOutlined, FileTextOutlined,
  FileProtectOutlined, SafetyOutlined, SettingOutlined,
  TeamOutlined, UserOutlined, ReloadOutlined, SendOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  DeleteOutlined, ReadOutlined, SearchOutlined,
} from '@ant-design/icons';

import { api } from '../services/api';
import { useUserStore, useNotificationStore, formatNumber } from '../store';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;

const PRIORITY_COLORS = {
  LOW: 'green',
  MEDIUM: 'blue',
  HIGH: 'orange',
  URGENT: 'red',
  CRITICAL: '#8b0000',
};

const PRIORITY_LABELS = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  URGENT: '紧急',
  CRITICAL: '极紧急',
};

const PRIORITY_ICONS = {
  LOW: <InfoCircleOutlined />,
  MEDIUM: <BellOutlined />,
  HIGH: <ExclamationCircleOutlined />,
  URGENT: <ThunderboltOutlined />,
  CRITICAL: <ThunderboltOutlined />,
};

const TYPE_LABELS = {
  HIGH_RISK_ALERT: '高风险告警',
  REVIEW_TICKET_CREATED: '工单创建',
  REVIEW_TICKET_ASSIGNED: '工单分配',
  REVIEW_TICKET_ESCALATED: '工单升级',
  REVIEW_TICKET_APPROVED: '工单通过',
  REVIEW_TICKET_REJECTED: '工单拒绝',
  REVIEW_SLA_WARNING: 'SLA即将超时',
  REPORT_GENERATED: '报告生成',
  SANCTION_UPLOAD_COMPLETED: '制裁名单上传',
  SYSTEM_ALERT: '系统告警',
  SUPPLIER_BLACKLISTED: '供应商拉黑',
};

const TYPE_ICONS = {
  HIGH_RISK_ALERT: <SafetyOutlined />,
  REVIEW_TICKET_CREATED: <FileProtectOutlined />,
  REVIEW_TICKET_ASSIGNED: <TeamOutlined />,
  REVIEW_TICKET_ESCALATED: <ThunderboltOutlined />,
  REVIEW_TICKET_APPROVED: <CheckCircleOutlined />,
  REVIEW_TICKET_REJECTED: <CloseCircleOutlined />,
  REVIEW_SLA_WARNING: <ClockCircleOutlined />,
  REPORT_GENERATED: <FileTextOutlined />,
  SANCTION_UPLOAD_COMPLETED: <FileTextOutlined />,
  SYSTEM_ALERT: <ExclamationCircleOutlined />,
  SUPPLIER_BLACKLISTED: <UserOutlined />,
};

const CHANNEL_LABELS = {
  IN_APP: '站内通知',
  EMAIL: '邮件',
  WEBHOOK: '合规群推送',
  SMS: '短信',
};

const CHANNEL_STATUS_LABELS = {
  PENDING: '待发送',
  SENT: '已发送',
  FAILED: '发送失败',
  READ: '已读',
};

const CHANNEL_STATUS_COLORS = {
  PENDING: 'default',
  SENT: 'blue',
  FAILED: 'red',
  READ: 'green',
};



const Notifications = () => {
  const hasPermission = useUserStore((s) => s.hasPermission);
  const fetchUnread = useNotificationStore((s) => s.fetchUnread);
  const setUnread = useNotificationStore((s) => s.setUnread);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [activeTab, setActiveTab] = useState('all');
  const [filters, setFilters] = useState({
    type: undefined, priority: undefined, onlyUnread: false,
  });
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [webhookForm] = Form.useForm();
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [typeConfig, setTypeConfig] = useState(null);
  const [markLoading, setMarkLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (filters.type) params.type = filters.type;
      if (filters.priority) params.priority = filters.priority;
      if (filters.onlyUnread) params.read = false;
      if (activeTab === 'unread') params.read = false;
      if (activeTab === 'urgent') params.minPriority = 'HIGH';

      const res = await api.notifications.list(params);
      setData(res.notifications || []);
      setTotal(res.total || 0);
      setUnreadTotal(res.unread || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [page, pageSize, activeTab]);

  const handleSearch = () => { setPage(1); fetchData(); };

  const openDetail = async (id, markAsRead = true) => {
    setDetailOpen(true);
    try {
      const res = await api.notifications.get(id);
      setDetail(res);
      if (markAsRead && !res.read) {
        await api.notifications.markRead({ ids: [id] });
        fetchData();
        fetchUnread(api);
      }
    } catch (e) { message.error('加载通知详情失败'); }
  };

  const markAllRead = async () => {
    try {
      setMarkLoading(true);
      await api.notifications.markRead({ all: true });
      message.success('已全部标记为已读');
      setUnreadTotal(0);
      setUnread(0, 0);
      fetchData();
    } catch (e) {
      message.error(e.response?.data?.error || '操作失败');
    } finally { setMarkLoading(false); }
  };

  const markSelectedRead = async () => {
    if (!selectedRowKeys.length) return;
    try {
      setMarkLoading(true);
      await api.notifications.markRead({ ids: selectedRowKeys });
      message.success(`已标记 ${selectedRowKeys.length} 条为已读`);
      setSelectedRowKeys([]);
      fetchData();
      fetchUnread(api);
    } catch (e) {
      message.error(e.response?.data?.error || '操作失败');
    } finally { setMarkLoading(false); }
  };

  const archiveSelected = async () => {
    if (!selectedRowKeys.length) return;
    try {
      await Promise.all(selectedRowKeys.map((id) => api.notifications.archive(id)));
      message.success(`已归档 ${selectedRowKeys.length} 条通知`);
      setSelectedRowKeys([]);
      fetchData();
    } catch (e) { message.error('归档失败'); }
  };

  const testWebhook = async (values) => {
    try {
      const res = await api.notifications.testWebhook(values);
      if (res.success) {
        message.success('Webhook 测试消息发送成功');
        setWebhookOpen(false);
        webhookForm.resetFields();
      } else {
        message.error(res.error || '发送失败');
      }
    } catch (e) {
      message.error(e.response?.data?.error || '发送失败');
    }
  };

  const fetchTypeConfig = async () => {
    try {
      const res = await api.notifications.types();
      setTypeConfig(res);
    } catch (e) { /* ignore */ }
  };
  useEffect(() => { fetchTypeConfig(); }, []);

  const typeStatsOption = useMemo(() => {
    if (!typeConfig?.typeStats) return {};
    const stats = typeConfig.typeStats;
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, type: 'scroll' },
      series: [{
        type: 'pie', radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold' } },
        data: Object.entries(stats).map(([k, v]) => ({
          name: TYPE_LABELS[k] || k,
          value: v,
        })),
      }],
    };
  }, [typeConfig]);

  const columns: Array = [
    {
      title: '优先级', dataIndex: 'priority', width: 90, align: 'center',
      render: (v) => {
        const iconColor = v === 'CRITICAL' ? '#8b0000' : undefined;
        return (
          <Tooltip title={`优先级: ${PRIORITY_LABELS[v]}`}>
            <Tag color={PRIORITY_COLORS[v]} icon={<span style={{ color: iconColor }}>{PRIORITY_ICONS[v]}</span>}>
              {PRIORITY_LABELS[v]}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '类型', dataIndex: 'type', width: 140,
      render: (v) => (
        <Space>
          <span className="text-blue-500">{TYPE_ICONS[v]}</span>
          <span className="text-sm">{TYPE_LABELS[v] || v}</span>
        </Space>
      ),
    },
    {
      title: '标题 / 摘要', dataIndex: 'title',
      render: (v, r) => (
        <div
          className="cursor-pointer hover:text-blue-600"
          onClick={() => openDetail(r._id)}
        >
          <div className="font-medium text-sm flex items-center gap-2">
            {!r.read && <Badge status="error" />}
            {v}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">
            {r.summary || r.content}
          </div>
        </div>
      ),
    },
    {
      title: '送达状态', dataIndex: 'channels', width: 160,
      render: (channels) => (
        <Space size={[4, 4]} wrap>
          {channels?.map((c) => (
            <Tooltip key={c.channel} title={`${CHANNEL_LABELS[c.channel]}: ${CHANNEL_STATUS_LABELS[c.status]}${c.error ? `\n错误: ${c.error}` : ''}`}>
              <Tag
                color={c.status === 'FAILED' ? 'red' : c.status === 'READ' ? 'green' : c.status === 'SENT' ? 'blue' : 'default'}
                className="!text-xs !py-0 !m-0"
              >
                {CHANNEL_LABELS[c.channel]?.slice(0, 2)}
              </Tag>
            </Tooltip>
          ))}
        </Space>
      ),
    },
    {
      title: '时间', dataIndex: 'createdAt', width: 150,
      render: (v) => (
        <span className="text-xs text-gray-500 font-mono">
          {dayjs(v).format('MM-DD HH:mm:ss')}
        </span>
      ),
    },
    {
      title: '状态', width: 80, align: 'center',
      render: (_, r) => r.read
        ? <Tag color="green" icon={<ReadOutlined />}>已读</Tag>
        : <Tag color="red" icon={<BellOutlined />}>未读</Tag>,
    },
    {
      title: '操作', width: 100, fixed: 'right',
      render: (_, r) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => openDetail(r._id, false)}>查看</Button>
          {!r.read && (
            <Button type="link" size="small" onClick={async () => {
              await api.notifications.markRead({ ids: [r._id] });
              fetchData(); fetchUnread(api);
            }}>已读</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card className="!rounded-xl shadow-sm border-l-4 border-blue-500">
            <Statistic
              title="通知总数"
              value={total}
              prefix={<BellOutlined className="text-blue-500" />}
              formatter={formatNumber}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="!rounded-xl shadow-sm border-l-4 border-red-500">
            <Statistic
              title="未读通知"
              value={unreadTotal}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<Badge count={unreadTotal} />}
              formatter={formatNumber}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="!rounded-xl shadow-sm border-l-4 border-orange-500">
            <Statistic
              title="高优先级"
              value={typeConfig?.priorityStats?.HIGH || 0}
              valueStyle={{ color: '#fa8c16' }}
              prefix={<ExclamationCircleOutlined />}
              formatter={formatNumber}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="!rounded-xl shadow-sm border-l-4 border-purple-500">
            <Statistic
              title="紧急告警"
              value={typeConfig?.priorityStats?.URGENT || 0}
              valueStyle={{ color: '#722ed1' }}
              prefix={<ThunderboltOutlined />}
              formatter={formatNumber}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 0]}>
        <Col xs={24} md={8}>
          <Card size="small" title="通知类型分布" className="!rounded-lg shadow-sm h-full">
            {typeConfig?.typeStats ? (
              <ReactECharts option={typeStatsOption} style={{ height: 220 }} notMerge />
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="!py-10" />}
          </Card>
        </Col>
        <Col xs={24} md={16}>
          <Card size="small" title="快速操作 & 筛选" className="!rounded-lg shadow-sm h-full">
            <div className="space-y-4">
              <Space wrap>
                <Button
                  type="primary" icon={<ReadOutlined />}
                  onClick={markAllRead} loading={markLoading}
                  disabled={!unreadTotal}
                >
                  全部标记已读
                </Button>
                <Button
                  icon={<CheckOutlined />}
                  onClick={markSelectedRead}
                  disabled={!selectedRowKeys.length}
                >
                  标记选中已读 ({selectedRowKeys.length})
                </Button>
                <Button
                  icon={<DeleteOutlined />}
                  onClick={archiveSelected}
                  disabled={!selectedRowKeys.length}
                >
                  归档选中
                </Button>
                {hasPermission('notification:webhook') && (
                  <Button
                    type="dashed" icon={<SendOutlined />}
                    onClick={() => setWebhookOpen(true)}
                  >
                    测试合规群推送
                  </Button>
                )}
                <Button icon={<ReloadOutlined />} onClick={() => { fetchData(); fetchTypeConfig(); }}>
                  刷新
                </Button>
              </Space>

              <Divider className="!my-3" />

              <Row gutter={[12, 12]}>
                <Col xs={24} sm={8}>
                  <label className="block text-xs text-gray-500 mb-1">通知类型</label>
                  <Select
                    allowClear style={{ width: '100%' }} placeholder="全部类型"
                    showSearch optionFilterProp="children"
                    value={filters.type}
                    onChange={(v) => setFilters((f) => ({ ...f, type: v }))}
                  >
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <Option key={k} value={k}>{v}</Option>
                    ))}
                  </Select>
                </Col>
                <Col xs={24} sm={8}>
                  <label className="block text-xs text-gray-500 mb-1">最低优先级</label>
                  <Select
                    allowClear style={{ width: '100%' }} placeholder="全部优先级"
                    value={filters.priority}
                    onChange={(v) => setFilters((f) => ({ ...f, priority: v }))}
                  >
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <Option key={k} value={k}>{v}</Option>
                    ))}
                  </Select>
                </Col>
                <Col xs={24} sm={8}>
                  <label className="block text-xs text-gray-500 mb-1">&nbsp;</label>
                  <div className="flex items-center gap-4 h-8">
                    <Checkbox
                      checked={filters.onlyUnread}
                      onChange={(e) => setFilters((f) => ({ ...f, onlyUnread: e.target.checked }))}
                    >
                      仅显示未读
                    </Checkbox>
                    <Button type="primary" size="small" icon={<SearchOutlined />} onClick={handleSearch}>
                      应用筛选
                    </Button>
                  </div>
                </Col>
              </Row>
            </div>
          </Card>
        </Col>
      </Row>

      <Card
        className="!rounded-xl shadow-sm"
        title={
          <Tabs
            activeKey={activeTab}
            onChange={(k) => { setActiveTab(k); setPage(1); }}
            size="small"
            items={[
              { key: 'all', label: `全部 (${total || '-'})` },
              { key: 'unread', label: <Badge count={unreadTotal} offset={[2, 2]}><span>未读</span></Badge> },
              { key: 'urgent', label: '高优先级' },
            ]}
          />
        }
      >
        <Table
          rowKey="_id"
          loading={loading}
          columns={columns}
          dataSource={data}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={{
            current: page, pageSize, total, showSizeChanger: true,
            showQuickJumper: true, pageSizeOptions: ['20', '50', '100'],
            showTotal: (t) => `共 ${t} 条通知`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
          scroll={{ x: 1100, y: 560 }}
        />
      </Card>

      {/* 详情抽屉 */}
      <Drawer
        title={
          <Space>
            {detail && PRIORITY_ICONS[detail.priority]}
            <span className="text-lg">通知详情</span>
            {detail && <Tag color={PRIORITY_COLORS[detail.priority]}>{PRIORITY_LABELS[detail.priority]}</Tag>}
          </Space>
        }
        open={detailOpen} onClose={() => setDetailOpen(false)}
        width={640} destroyOnClose
      >
        {detail ? (
          <div className="space-y-4">
            <Alert
              type={detail.priority === 'URGENT' || detail.priority === 'CRITICAL' ? 'error'
                : detail.priority === 'HIGH' ? 'warning' : 'info'}
              showIcon
              message={detail.title}
              description={detail.summary}
            />

            <Card size="small" className="!rounded-lg" title="通知详情">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="通知ID"><code className="text-xs">{detail._id}</code></Descriptions.Item>
                <Descriptions.Item label="类型">
                  <Space>
                    {TYPE_ICONS[detail.type]}
                    <span className="font-medium">{TYPE_LABELS[detail.type] || detail.type}</span>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">{dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
                <Descriptions.Item label="接收人">
                  {detail.user ? `${detail.user.name} (${detail.user.username})` : '系统广播'}
                </Descriptions.Item>
                <Descriptions.Item label="关联资源">
                  {detail.resourceType ? (
                    <Space>
                      <Tag color="purple">{detail.resourceType}</Tag>
                      <code className="text-xs">{detail.resourceId}</code>
                    </Space>
                  ) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="读取状态">
                  {detail.read
                    ? <Tag color="green">已于 {dayjs(detail.readAt).format('MM-DD HH:mm')} 读取</Tag>
                    : <Tag color="red">未读</Tag>}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card size="small" className="!rounded-lg" title="通知正文">
              <div className="whitespace-pre-wrap bg-gray-50 p-3 rounded-lg text-sm">
                {detail.content}
              </div>
            </Card>

            {detail.metadata && Object.keys(detail.metadata).length > 0 && (
              <Card size="small" className="!rounded-lg" title="附加元数据">
                <pre className="bg-gray-50 p-3 rounded-lg text-xs overflow-auto !m-0">
                  {JSON.stringify(detail.metadata, null, 2)}
                </pre>
              </Card>
            )}

            <Card size="small" className="!rounded-lg" title="多渠道投递状态">
              <List
                size="small"
                dataSource={detail.channels || []}
                renderItem={(c) => (
                  <List.Item>
                    <Row className="w-full" align="middle" gutter={[8, 0]}>
                      <Col span={6}>
                        <Space>
                          {c.channel === 'WEBHOOK' ? <SendOutlined className="text-green-500" />
                            : c.channel === 'EMAIL' ? <BellOutlined className="text-blue-500" />
                            : c.channel === 'IN_APP' ? <InfoCircleOutlined className="text-purple-500" />
                            : <BellOutlined />}
                          <span className="font-medium">{CHANNEL_LABELS[c.channel] || c.channel}</span>
                        </Space>
                      </Col>
                      <Col span={6}>
                        <Tag color={CHANNEL_STATUS_COLORS[c.status]}>
                          {CHANNEL_STATUS_LABELS[c.status]}
                        </Tag>
                      </Col>
                      <Col span={6} className="text-xs text-gray-500">
                        {c.sentAt ? dayjs(c.sentAt).format('HH:mm:ss') : '-'}
                      </Col>
                      <Col span={6} className="text-xs text-red-500">
                        {c.error || '-'}
                      </Col>
                    </Row>
                  </List.Item>
                )}
              />
            </Card>
          </div>
        ) : <Empty description="通知不存在" />}
      </Drawer>

      {/* Webhook测试模态 */}
      <Modal
        title={<Space><SendOutlined className="text-green-500" />测试合规群 Webhook 推送</Space>}
        open={webhookOpen} onCancel={() => setWebhookOpen(false)}
        footer={null} destroyOnClose
      >
        <Form layout="vertical" form={webhookForm} onFinish={testWebhook}
          initialValues={{
            url: process.env.REACT_APP_WEBHOOK_URL || 'https://open.feishu.cn/open-apis/bot/v2/hook/your-token',
            title: '[测试] 合规系统高风险告警推送',
            content: '这是一条来自合规交易监控系统的测试消息。\n如果您收到此消息，说明合规群Webhook推送配置正常。\n\n测试时间: ' + new Date().toLocaleString(),
            priority: 'HIGH',
          }}
        >
          <Form.Item name="url" label="Webhook URL (飞书/企业微信群机器人)" rules={[{ required: true, message: '请输入Webhook地址' }]}>
            <Input placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/xxx" />
          </Form.Item>
          <Form.Item name="title" label="消息标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="content" label="消息内容" rules={[{ required: true }]}>
            <TextArea rows={5} />
          </Form.Item>
          <Form.Item name="priority" label="模拟优先级">
            <Select>
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                <Option key={k} value={k}>{v}</Option>
              ))}
            </Select>
          </Form.Item>
          <Alert
            type="info" showIcon
            message="说明"
            description="此功能用于测试合规群机器人推送是否正常工作。系统实际产生的高风险告警会自动推送到配置的Webhook地址。"
            className="mb-4"
          />
          <Form.Item className="!mb-0 text-right">
            <Space>
              <Button onClick={() => setWebhookOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />}>发送测试消息</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Notifications;
