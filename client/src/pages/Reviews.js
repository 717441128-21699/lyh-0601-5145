import React, { useState, useEffect } from 'react';
import {
  Card, Table, Tag, Button, Space, Modal, Form, Select, Input, App, Drawer,
  Descriptions, Divider, Typography, Row, Col, Statistic, Progress, Empty, Tooltip,
  FloatButton, Avatar, DatePicker, TimePicker, Radio, List, Timeline,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  EyeOutlined,
  UserSwitchOutlined,
  SafetyOutlined,
  ArrowUpOutlined,
  FilterOutlined,
  ReloadOutlined,
  FileSearchOutlined,
  CommentOutlined,
  ExclamationCircleOutlined,
  ExportOutlined,
  FileExcelOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import {
  RISK_COLORS, RISK_LABELS, REVIEW_STATUS_COLORS, REVIEW_STATUS_LABELS,
  formatNumber, COUNTRIES, formatCurrency,
} from '../store';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

export default function Reviews() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [filters, setFilters] = useState({});
  const [dashboard, setDashboard] = useState({});
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [reviewerList, setReviewerList] = useState([]);

  const loadDashboard = async () => {
    try {
      const d = await api.reviews.dashboard();
      setDashboard(d);
    } catch { /* ignore */ }
    try {
      const r = await api.reviews.workload();
      setReviewerList(r);
    } catch { /* ignore */ }
  };

  const loadData = async (page = 1, pageSize = 20, extra = {}) => {
    setLoading(true);
    try {
      const initial = {};
      const params = new URLSearchParams(location.search);
      if (params.get('priority')) initial.priority = params.get('priority');

      const res = await api.reviews.list({
        ...initial,
        ...filters,
        ...extra,
        page,
        pageSize,
      });
      setData(res.items || []);
      setTotal(res.total);
      setPagination({ current: page, pageSize });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    loadData(1, 20);
  }, []);

  const OpenDetail = async (ticketId) => {
    setDetail(ticketId);
    setDetailLoading(true);
    try {
      const res = await api.reviews.get(ticketId);
      setDetail(res);
    } catch {
      message.error('获取详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const doApprove = async (ticketId, notes) => {
    try {
      await api.reviews.approve(ticketId, notes);
      message.success('审批通过');
      loadData(pagination.current, pagination.pageSize);
      loadDashboard();
      setDetail(null);
    } catch { /* handled */ }
  };

  const doReject = async (ticketId, reason, category, notes) => {
    try {
      await api.reviews.reject(ticketId, { reason, category, notes });
      message.success('已拒绝交易');
      loadData(pagination.current, pagination.pageSize);
      loadDashboard();
      setDetail(null);
    } catch { /* handled */ }
  };

  const doAssign = async (ticketId, assignTo) => {
    try {
      await api.reviews.assign(ticketId, assignTo);
      message.success('已分配');
      loadData(pagination.current, pagination.pageSize);
      loadDashboard();
    } catch { /* handled */ }
  };

  const doEscalate = async (ticketId, reason) => {
    modal.confirm({
      title: '确认升级工单',
      content: (
        <div>
          <Paragraph>将工单升级至合规总监</Paragraph>
          <Form layout="vertical" style={{ marginTop: 10 }}>
            <Form.Item label="升级原因" name="reason">
              <TextArea rows={3} placeholder="请输入升级原因（选填）" defaultValue={reason} id="escalate_reason_input" />
            </Form.Item>
          </Form>
        </div>
      ),
      okText: '确认升级',
      okButtonProps: { danger: true },
      onOk: async () => {
        const val = document.getElementById('escalate_reason_input')?.value || reason || '手工升级';
        try {
          await api.reviews.escalate(ticketId, val);
          message.success('已升级');
          loadData(pagination.current, pagination.pageSize);
          loadDashboard();
          setDetail(null);
        } catch { /* handled */ }
      },
    });
  };

  const openApproveModal = (ticket) => {
    modal.confirm({
      title: '审批通过 - 放行交易',
      icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
      content: (
        <div>
          <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="工单号">{ticket.ticketId}</Descriptions.Item>
            <Descriptions.Item label="关联交易">{ticket.transactionRefId}</Descriptions.Item>
            <Descriptions.Item label="风险等级">
              <Tag color={RISK_COLORS[ticket.riskLevel]}>{RISK_LABELS[ticket.riskLevel]} - {ticket.riskScore}分</Tag>
            </Descriptions.Item>
          </Descriptions>
          <Form layout="vertical">
            <Form.Item label="审批备注" name="notes" rules={[{ required: true, message: '请输入审批意见' }]}>
              <TextArea rows={3} placeholder="请输入审批意见（必填）" id="approve_notes_input" />
            </Form.Item>
          </Form>
        </div>
      ),
      okText: '确认通过',
      okButtonProps: { type: 'primary', style: { background: '#52c41a' } },
      onOk: async () => {
        const notes = document.getElementById('approve_notes_input')?.value;
        if (!notes) {
          message.error('请输入审批意见');
          return Promise.reject();
        }
        await doApprove(ticket.ticketId, notes);
      },
    });
  };

  const openRejectModal = (ticket) => {
    modal.confirm({
      title: '拒绝交易 - 合规审查不通过',
      icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
      okText: '确认拒绝',
      okButtonProps: { danger: true },
      width: 560,
      content: (
        <div>
          <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="工单号">{ticket.ticketId}</Descriptions.Item>
            <Descriptions.Item label="关联交易">{ticket.transactionRefId}</Descriptions.Item>
            <Descriptions.Item label="供应商">
              {ticket.transactionId?.supplierName || '见详情'}
            </Descriptions.Item>
          </Descriptions>
          <Form layout="vertical">
            <Form.Item label="拒绝分类" name="category" rules={[{ required: true, message: '请选择分类' }]}>
              <Select placeholder="请选择拒绝分类" id="reject_category_input">
                <Option value="SANCTION_MATCH">制裁名单命中</Option>
                <Option value="HIGH_RISK_COUNTRY">高风险国家/地区</Option>
                <Option value="SENSITIVE_USE">敏感最终用途</Option>
                <Option value="SUPPLIER_RISK">供应商风险</Option>
                <Option value="MANUAL_DECISION">人工判定</Option>
              </Select>
            </Form.Item>
            <Form.Item label="拒绝原因" name="reason" rules={[{ required: true, message: '请输入原因' }]}>
              <TextArea rows={3} placeholder="详细说明拒绝原因（必填）" id="reject_reason_input" />
            </Form.Item>
            <Form.Item label="备注/证据" name="notes">
              <TextArea rows={2} placeholder="补充说明或证据链接" id="reject_notes_input" />
            </Form.Item>
          </Form>
        </div>
      ),
      onOk: async () => {
        const category = document.getElementById('reject_category_input')?.value;
        const reason = document.getElementById('reject_reason_input')?.value;
        const notes = document.getElementById('reject_notes_input')?.value;
        if (!category || !reason) {
          message.error('请完整填写分类和原因');
          return Promise.reject();
        }
        await doReject(ticket.ticketId, reason, category, notes);
      },
    });
  };

  const ticket = detail?.ticket;

  const columns = [
    {
      title: '工单号', dataIndex: 'ticketId', width: 140, fixed: 'left',
      render: (v) => (
        <a onClick={() => OpenDetail(v)} style={{ fontFamily: 'monospace', fontWeight: 500 }}>{v}</a>
      ),
    },
    {
      title: '关联交易', dataIndex: 'transactionRefId', width: 200,
      render: (v, r) => (
        <Space>
          <a onClick={() => navigate(`/transactions/${v}`)} style={{ fontFamily: 'monospace' }}>{v}</a>
          {r.transactionId && (
            <Tooltip title={r.transactionId.supplierName}>
              <Tag color="blue" style={{ fontSize: 11 }}>{r.transactionId.supplierCountry}</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '供应商',
      dataIndex: ['transactionId', 'supplierName'],
      width: 180,
      ellipsis: true,
      render: (v) => v || '-',
    },
    {
      title: '风险评分', width: 150, dataIndex: 'riskScore',
      render: (v, r) => (
        <Progress
          percent={v}
          size="small"
          strokeColor={RISK_COLORS[r.riskLevel]}
          format={(p) => <span style={{ color: RISK_COLORS[r.riskLevel], fontWeight: 600 }}>{p}</span>}
        />
      ),
    },
    {
      title: '风险等级', width: 100, dataIndex: 'riskLevel',
      render: v => <Tag color={RISK_COLORS[v]} style={{ fontWeight: 600, padding: '2px 10px' }}>{RISK_LABELS[v] || v}</Tag>,
    },
    {
      title: '优先级', width: 90, dataIndex: 'priority',
      render: v => {
        const map = { URGENT: { c: 'red', t: '紧急' }, HIGH: { c: 'orange', t: '高' }, MEDIUM: { c: 'blue', t: '中' }, LOW: { c: 'green', t: '低' } };
        return <Tag color={map[v]?.c} style={{ fontWeight: 600 }}>{map[v]?.t || v}</Tag>;
      },
    },
    {
      title: '状态', width: 100, dataIndex: 'status',
      render: v => <Tag color={REVIEW_STATUS_COLORS[v]} style={{ padding: '2px 10px' }}>{REVIEW_STATUS_LABELS[v] || v}</Tag>,
    },
    {
      title: '处理人/组', width: 140,
      render: (_, r) => (
        <Space direction="vertical" size={0} style={{ fontSize: 12 }}>
          <Text>👤 {r.reviewerAssigned || '未分配'}</Text>
          <Text type="secondary">🏢 {r.assignedGroup || '-'}</Text>
        </Space>
      ),
    },
    {
      title: '审查时限', width: 170,
      render: (_, r) => {
        const deadline = dayjs(r.reviewDeadline);
        const now = dayjs();
        const diff = deadline.diff(now, 'minute');
        const overdue = r.isOverdue || diff < 0;
        const remaining = Math.abs(diff);
        const hours = Math.floor(remaining / 60);
        const minutes = remaining % 60;

        return (
          <div style={{ fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: overdue ? '#ff4d4f' : '#888' }}>
              {overdue ? <WarningOutlined /> : <ClockCircleOutlined />}
              <Text strong style={{ color: overdue ? '#ff4d4f' : undefined }}>
                {deadline.format('MM-DD HH:mm')}
              </Text>
            </div>
            <Text type={overdue ? 'danger' : 'secondary'} style={{ fontSize: 11 }}>
              {overdue ? `已超时 ${hours}h${minutes}m` : `剩余 ${hours}h${minutes}m`}
            </Text>
          </div>
        );
      },
    },
    {
      title: '命中条数', width: 90, dataIndex: 'sanctionMatches',
      render: v => v?.length || 0,
    },
    {
      title: '操作', width: 240, fixed: 'right',
      render: (_, r) => (
        <Space size={4} wrap>
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => OpenDetail(r.ticketId)}>详情</Button>
          {r.status === 'PENDING' && (
            <Select
              size="small"
              placeholder="分配"
              style={{ width: 100 }}
              onChange={(v) => doAssign(r.ticketId, v)}
              options={reviewerList.map(rev => ({ value: rev.userId, label: rev.fullName || rev.username }))}
            />
          )}
          {['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED'].includes(r.status) && (
            <>
              <Button size="small" type="link" icon={<CheckCircleOutlined />} style={{ color: '#52c41a' }} onClick={() => openApproveModal(r)}>通过</Button>
              <Button size="small" type="link" danger icon={<CloseCircleOutlined />} onClick={() => openRejectModal(r)}>拒绝</Button>
            </>
          )}
          {r.status !== 'ESCALATED' && !r.escalated && (
            <Tooltip title="升级至合规总监">
              <Button size="small" type="link" icon={<ArrowUpOutlined />} onClick={() => doEscalate(r.ticketId)}>升级</Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const statCards = [
    {
      title: '我待处理', value: dashboard.myPending || 0,
      color: '#1677ff', icon: <FileSearchOutlined />,
      click: () => setFilters({ assignedTo: useUserStore.getState().user?.userId }),
    },
    {
      title: '组内待分配', value: dashboard.groupPending || 0,
      color: '#722ed1', icon: <UserSwitchOutlined />,
      click: () => setFilters({ status: 'PENDING' }),
    },
    {
      title: '超时未处理', value: dashboard.overdue || 0,
      color: '#ff4d4f', icon: <WarningOutlined />,
      click: () => setFilters({ isOverdue: 'true' }),
    },
    {
      title: '升级工单', value: dashboard.escalated || 0,
      color: '#fa8c16', icon: <SafetyOutlined />,
      click: () => setFilters({ escalated: 'true' }),
    },
    {
      title: '今日完成', value: dashboard.completedToday || 0,
      color: '#52c41a', icon: <CheckCircleOutlined />,
    },
  ];

  const StatCard = ({ item }) => (
    <Card hoverable onClick={item.click} style={{ borderRadius: 10, border: 'none' }} bodyStyle={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>{item.title}</Text>
          <div style={{ fontSize: 24, fontWeight: 700, color: item.color, marginTop: 4 }}>
            {formatNumber(item.value)}
          </div>
        </div>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${item.color}15`, color: item.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>
          {item.icon}
        </div>
      </div>
    </Card>
  );

  const useUserStore = require('../store').useUserStore;

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        {statCards.map((c, i) => (
          <Col xs={12} sm={8} md={8} lg={4} xl={4} key={i}>
            <StatCard item={c} />
          </Col>
        ))}
      </Row>

      <Card
        style={{ borderRadius: 10, marginBottom: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <Space wrap size={10}>
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 130 }}
            mode="multiple"
            maxTagCount={2}
            value={filters.status ? (Array.isArray(filters.status) ? filters.status : [filters.status]) : undefined}
            onChange={v => setFilters(f => ({ ...f, status: v }))}
          >
            {Object.entries(REVIEW_STATUS_LABELS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
          </Select>
          <Select
            allowClear
            placeholder="风险等级"
            style={{ width: 130 }}
            mode="multiple"
            maxTagCount={2}
            value={filters.riskLevel ? (Array.isArray(filters.riskLevel) ? filters.riskLevel : [filters.riskLevel]) : undefined}
            onChange={v => setFilters(f => ({ ...f, riskLevel: v }))}
          >
            {Object.entries(RISK_LABELS).map(([k, v]) => <Option key={k} value={k}><Tag color={RISK_COLORS[k]}>{v}</Tag></Option>)}
          </Select>
          <Select
            allowClear
            placeholder="优先级"
            style={{ width: 110 }}
            value={filters.priority}
            onChange={v => setFilters(f => ({ ...f, priority: v }))}
          >
            <Option value="URGENT">紧急</Option>
            <Option value="HIGH">高</Option>
            <Option value="MEDIUM">中</Option>
            <Option value="LOW">低</Option>
          </Select>
          <Select
            allowClear
            placeholder="超时状态"
            style={{ width: 130 }}
            value={filters.isOverdue}
            onChange={v => setFilters(f => ({ ...f, isOverdue: v }))}
          >
            <Option value="true">已超时</Option>
            <Option value="false">未超时</Option>
          </Select>
          <Input
            allowClear
            placeholder="工单号/交易号"
            style={{ width: 200 }}
            prefix={<FileSearchOutlined />}
            onPressEnter={(e) => {
              const v = e.target.value;
              if (v.startsWith('REV-')) setFilters(f => ({ ...f, ticketId: v }));
              else setFilters(f => ({ ...f, transactionId: v }));
              loadData(1, pagination.pageSize);
            }}
          />
          <RangePicker showTime format="YYYY-MM-DD HH:mm" onChange={(dates) => {
            if (dates && dates.length === 2) {
              setFilters(f => ({
                ...f,
                startDate: dates[0].toISOString(),
                endDate: dates[1].toISOString(),
              }));
            } else {
              setFilters(f => { const { startDate, endDate, ...rest } = f; return rest; });
            }
          }} />
          <Space>
            <Button type="primary" icon={<FilterOutlined />} onClick={() => loadData(1, pagination.pageSize)}>应用筛选</Button>
            <Button icon={<ReloadOutlined />} onClick={() => {
              setFilters({});
              loadData(1, pagination.pageSize);
              loadDashboard();
            }}>重置刷新</Button>
          </Space>
        </Space>
      </Card>

      <Card style={{ borderRadius: 10, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }} bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="ticketId"
          loading={loading}
          size="middle"
          scroll={{ x: 1600 }}
          rowClassName={(r) => r.isOverdue && ['PENDING','ASSIGNED','IN_PROGRESS'].includes(r.status) ? 'row-warning' : ''}
          pagination={{
            ...pagination,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: t => `共 ${formatNumber(t)} 张工单`,
            onChange: (p, s) => loadData(p, s),
          }}
        />
      </Card>

      <Drawer
        title={
          <Space size="large">
            <FileSearchOutlined style={{ color: '#1677ff', fontSize: 22 }} />
            <div>
              <Title level={4} style={{ margin: 0 }}>{detail?.ticket?.ticketId || '工单详情'}</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {ticket?.transactionRefId} · 创建于 {ticket && dayjs(ticket.createdAt).format('YYYY-MM-DD HH:mm:ss')}
              </Text>
            </div>
            <Tag color={RISK_COLORS[ticket?.riskLevel]} style={{ fontWeight: 600, padding: '4px 12px' }}>
              {RISK_LABELS[ticket?.riskLevel]} · {ticket?.riskScore}分
            </Tag>
            <Tag color={REVIEW_STATUS_COLORS[ticket?.status]} style={{ padding: '4px 12px' }}>
              {REVIEW_STATUS_LABELS[ticket?.status]}
            </Tag>
            {ticket?.isOverdue && <Tag color="red">⚠️ 已超时</Tag>}
            {ticket?.escalated && <Tag color="orange">已升级</Tag>}
          </Space>
        }
        open={!!detail}
        onClose={() => setDetail(null)}
        width={960}
        loading={detailLoading}
        extra={
          ticket && ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED'].includes(ticket.status) && (
            <Space>
              {!ticket.escalated && <Button icon={<ArrowUpOutlined />} onClick={() => doEscalate(ticket.ticketId)}>升级</Button>}
              <Button type="primary" danger icon={<CloseCircleOutlined />} onClick={() => openRejectModal(ticket)}>拒绝</Button>
              <Button type="primary" icon={<CheckCircleOutlined />} style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={() => openApproveModal(ticket)}>通过放行</Button>
            </Space>
          )
        }
      >
        {ticket && (
          <div>
            <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="优先级"
                    value={{ URGENT: '紧急', HIGH: '高', MEDIUM: '中', LOW: '低' }[ticket.priority]}
                    valueStyle={{ color: { URGENT: '#ff4d4f', HIGH: '#fa8c16', MEDIUM: '#1677ff', LOW: '#52c41a' }[ticket.priority] }}
                    prefix={ticket.priority === 'URGENT' ? <ExclamationCircleOutlined /> : null}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="分配给"
                    value={ticket.reviewerAssigned || ticket.assignedGroup || '未分配'}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="审查截止"
                    value={dayjs(ticket.reviewDeadline).format('MM-DD HH:mm')}
                    suffix={ticket.isOverdue ? '(已超时)' : ''}
                    valueStyle={{ color: ticket.isOverdue ? '#ff4d4f' : undefined }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="制裁命中"
                    value={ticket.sanctionMatches?.length || 0}
                    valueStyle={{ color: ticket.sanctionMatches?.length > 0 ? '#ff4d4f' : '#52c41a' }}
                  />
                </Card>
              </Col>
            </Row>

            <Card type="inner" title="📋 风险摘要" style={{ marginBottom: 12 }}>
              <Paragraph style={{ margin: 0, fontSize: 14 }}>{ticket.riskSummary}</Paragraph>
              {ticket.escalateReason && (
                <Alert type="warning" showIcon message="升级原因" description={ticket.escalateReason} style={{ marginTop: 10 }} />
              )}
            </Card>

            <Card type="inner" title="💰 关联交易信息" style={{ marginBottom: 12 }}>
              {ticket.transactionId ? (
                <>
                  <Descriptions bordered size="small" column={2}>
                    <Descriptions.Item label="交易编号"><a onClick={() => navigate(`/transactions/${ticket.transactionRefId}`)}>{ticket.transactionRefId}</a></Descriptions.Item>
                    <Descriptions.Item label="PO编号">{ticket.transactionId.poNumber}</Descriptions.Item>
                    <Descriptions.Item label="下单日期">{dayjs(ticket.transactionId.orderDate).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
                    <Descriptions.Item label="总金额">{formatCurrency(ticket.transactionId.totalAmount, ticket.transactionId.currency)}</Descriptions.Item>
                    <Descriptions.Item label="供应商" span={2}>
                      <a onClick={() => navigate(`/suppliers/${ticket.transactionId.supplierId}`)}>
                        {ticket.transactionId.supplierName}
                      </a>
                      <Tag style={{ marginLeft: 8 }}>{ticket.transactionId.supplierCountry}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="HS编码">{ticket.transactionId.hsCode} - {ticket.transactionId.hsDescription}</Descriptions.Item>
                    <Descriptions.Item label="最终用户">{ticket.transactionId.endUser}</Descriptions.Item>
                    <Descriptions.Item label="贸易路径" span={2}>
                      🇸 {COUNTRIES[ticket.transactionId.originCountry] || ticket.transactionId.originCountry}
                      {' → '}
                      🇩 {COUNTRIES[ticket.transactionId.destinationCountry] || ticket.transactionId.destinationCountry}
                    </Descriptions.Item>
                  </Descriptions>
                </>
              ) : <Empty description="交易信息已删除或不存在" />}
            </Card>

            <Card type="inner" title={`🚨 制裁名单命中 (${ticket.sanctionMatches?.length || 0})`} style={{ marginBottom: 12 }}>
              {ticket.sanctionMatches?.length > 0 ? (
                <List
                  size="small"
                  bordered
                  dataSource={ticket.sanctionMatches}
                  renderItem={(m, idx) => (
                    <List.Item key={idx}>
                      <List.Item.Meta
                        avatar={
                          <Avatar style={{ backgroundColor: '#ff4d4f', verticalAlign: 'middle' }}>
                            {idx + 1}
                          </Avatar>
                        }
                        title={
                          <Space>
                            <Tag color="red">{m.listName}</Tag>
                            <Text strong>{m.matchValue}</Text>
                            {m.matchedEntryName && <Text type="secondary">- {m.matchedEntryName}</Text>}
                          </Space>
                        }
                        description={
                          <Space>
                            <Tag>字段: {m.matchedField}</Tag>
                            <span>匹配度:</span>
                            <Progress percent={m.matchScore} size="small" style={{ width: 120 }} />
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : <Empty description="无制裁名单命中" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
            </Card>

            {ticket.decision && (
              <Card type="inner" title={<Space><CommentOutlined />审查结论</Space>} style={{ marginBottom: 12 }}>
                <Alert
                  type={ticket.decision === 'RELEASE' ? 'success' : 'error'}
                  showIcon
                  message={ticket.decision === 'RELEASE' ? '✅ 审批通过 - 交易已放行' : '❌ 审查拒绝 - 交易已禁止'}
                  description={
                    <Descriptions size="small" column={2} style={{ marginTop: 8 }}>
                      <Descriptions.Item label="审查员">{ticket.reviewedBy}</Descriptions.Item>
                      <Descriptions.Item label="审查时间">{ticket.reviewedAt && dayjs(ticket.reviewedAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
                      <Descriptions.Item label="审查时长">{ticket.reviewDurationHours ? `${ticket.reviewDurationHours} 小时` : '-'}</Descriptions.Item>
                      <Descriptions.Item label="拒绝分类">{ticket.rejectionCategory || '-'}</Descriptions.Item>
                      <Descriptions.Item label="拒绝原因" span={2}>{ticket.rejectionReason || '-'}</Descriptions.Item>
                      <Descriptions.Item label="审批备注" span={2}>{ticket.decisionNotes || '-'}</Descriptions.Item>
                    </Descriptions>
                  }
                />
              </Card>
            )}

            <Card type="inner" title={<Space><ClockCircleOutlined />处理时间线 & 审计日志</Space>}>
              <Timeline
                items={[
                  {
                    color: 'blue',
                    children: (
                      <div>
                        <Text strong>工单创建</Text> · {dayjs(ticket.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                        <br /><Text type="secondary">系统自动创建（{ticket.source || 'auto'}）</Text>
                      </div>
                    ),
                  },
                  ticket.assignedAt && {
                    color: 'purple',
                    children: (
                      <div>
                        <Text strong>工单分配</Text> · {dayjs(ticket.assignedAt).format('YYYY-MM-DD HH:mm:ss')}
                        <br /><Text type="secondary">分配给: {ticket.reviewerAssigned || ticket.assignedGroup}</Text>
                      </div>
                    ),
                  },
                  ticket.escalatedAt && {
                    color: 'orange',
                    children: (
                      <div>
                        <Text strong>工单升级</Text> · {dayjs(ticket.escalatedAt).format('YYYY-MM-DD HH:mm:ss')}
                        <br /><Text type="secondary">升级至: {ticket.escalatedTo || '合规总监'} - {ticket.escalateReason || ''}</Text>
                      </div>
                    ),
                  },
                  ticket.reviewedAt && {
                    color: ticket.decision === 'RELEASE' ? 'green' : 'red',
                    children: (
                      <div>
                        <Text strong>工单{ticket.decision === 'RELEASE' ? '通过' : '拒绝'}</Text> · {dayjs(ticket.reviewedAt).format('YYYY-MM-DD HH:mm:ss')}
                        <br /><Text type="secondary">审查人: {ticket.reviewedBy} · 用时 {ticket.reviewDurationHours || 0}小时</Text>
                      </div>
                    ),
                  },
                  ...(detail?.auditLogs || []).slice(0, 5).map(l => ({
                    color: l.severity === 'ERROR' || l.severity === 'CRITICAL' ? 'red' : 'gray',
                    children: (
                      <div>
                        <Text strong>{l.action}</Text> · {dayjs(l.timestamp).format('YYYY-MM-DD HH:mm:ss')}
                        <br /><Text type="secondary">{l.userName || '系统'} - {l.description}</Text>
                      </div>
                    ),
                  })).reverse(),
                ].filter(Boolean)}
              />
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  );
}

const Alert = ({ type, message, description, showIcon }) => {
  const colors = {
    success: { bg: '#f6ffed', border: '#b7eb8f', icon: '✅', text: '#389e0d' },
    error: { bg: '#fff2f0', border: '#ffccc7', icon: '❌', text: '#cf1322' },
    warning: { bg: '#fffbe6', border: '#ffe58f', icon: '⚠️', text: '#d48806' },
    info: { bg: '#e6f7ff', border: '#91d5ff', icon: 'ℹ️', text: '#096dd9' },
  };
  const c = colors[type] || colors.info;
  return (
    <div style={{ padding: '10px 16px', background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text }}>
      <div style={{ fontWeight: 600 }}>{showIcon && c.icon} {message}</div>
      {description && <div style={{ marginTop: 4, color: '#666' }}>{description}</div>}
    </div>
  );
};
