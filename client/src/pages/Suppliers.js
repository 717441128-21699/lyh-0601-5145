import React, { useState, useEffect } from 'react';
import {
  Card, Table, Tag, Button, Space, Input, Select, Modal, Form, Drawer, App,
  Typography, Row, Col, Statistic, Progress, Empty, Tooltip, Divider,
  Descriptions, Alert, List, Avatar, FloatButton,
} from 'antd';
import {
  SearchOutlined, FilterOutlined, ReloadOutlined, EyeOutlined,
  SafetyOutlined, UnlockOutlined, WarningOutlined,
  UserOutlined, FlagOutlined, BankOutlined, TeamOutlined, RiseOutlined,
  CloseCircleOutlined, SwapOutlined, SyncOutlined, HistoryOutlined,
  BlockOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { RISK_COLORS, RISK_LABELS, formatCurrency, formatNumber } from '../store';
import ReactECharts from 'echarts-for-react';

const { Option } = Select;
const { Text, Title } = Typography;
const { TextArea } = Input;

export default function Suppliers() {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [filters, setFilters] = useState({});
  const [stats, setStats] = useState({ byRisk: [], byCompliance: [], byCountry: [], total: 0, blacklisted: 0 });

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadStats = async () => {
    try {
      const s = await api.suppliers.stats();
      setStats(s);
    } catch { /* ignore */ }
  };

  const loadData = async (page = 1, pageSize = 20, extra = {}) => {
    setLoading(true);
    try {
      const res = await api.suppliers.list({ ...filters, ...extra, page, pageSize });
      setData(res.items || []);
      setTotal(res.total);
      setPagination({ current: page, pageSize });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    loadStats();
    loadData();
  }, []);

  const openDetail = async (supplierId) => {
    setDetail(supplierId);
    setDetailLoading(true);
    try {
      const res = await api.suppliers.get(supplierId);
      setDetail(res);
    } catch { message.error('获取详情失败'); }
    finally { setDetailLoading(false); }
  };

  const doBlacklist = (s) => {
    modal.confirm({
      title: `确认将 ${s.name} 加入黑名单？`,
      icon: <BlockOutlined style={{ color: '#ff4d4f' }} />,
      okText: '确认拉黑',
      okButtonProps: { danger: true },
      content: (
        <div>
          <Descriptions size="small" column={1} style={{ marginBottom: 10 }}>
            <Descriptions.Item label="供应商ID">{s.supplierId}</Descriptions.Item>
            <Descriptions.Item label="所在国家">{s.country}</Descriptions.Item>
            <Descriptions.Item label="当前风险">{RISK_LABELS[s.riskLevel]} ({s.riskScore}分)</Descriptions.Item>
          </Descriptions>
          <Form layout="vertical">
            <Form.Item label="拉黑原因" name="reason" rules={[{ required: true, message: '必填' }]}>
              <TextArea rows={3} placeholder="请输入拉黑原因" id="bl_reason" />
            </Form.Item>
            <Form.Item name="autoReject" valuePropName="checked">
              <Checkbox defaultChecked>同时拒绝该供应商所有待处理交易</Checkbox>
            </Form.Item>
          </Form>
        </div>
      ),
      onOk: async () => {
        const reason = document.getElementById('bl_reason')?.value;
        if (!reason) { message.error('请输入原因'); return Promise.reject(); }
        const auto = !!document.querySelector('[name="autoReject"]')?.checked;
        try {
          await api.suppliers.blacklist(s.supplierId, { reason, autoRejectTxns: auto });
          message.success('已加入黑名单');
          loadData(pagination.current, pagination.pageSize);
          loadStats();
          setDetail(null);
        } catch { /* handled */ }
      },
    });
  };

  const { Checkbox } = Modal;

  const doUnblock = (s) => {
    modal.confirm({
      title: `确认解除黑名单：${s.name}？`,
      icon: <UnlockOutlined style={{ color: '#52c41a' }} />,
      okText: '确认解除',
      content: (
        <Form layout="vertical">
          <Form.Item label="解除原因" name="reason">
            <TextArea rows={2} placeholder="选填" id="ubl_reason" />
          </Form.Item>
        </Form>
      ),
      onOk: async () => {
        try {
          await api.suppliers.unblock(s.supplierId, document.getElementById('ubl_reason')?.value);
          message.success('已解除黑名单');
          loadData(pagination.current, pagination.pageSize);
          loadStats();
          setDetail(null);
        } catch { /* handled */ }
      },
    });
  };

  const columns = [
    {
      title: '供应商ID', dataIndex: 'supplierId', width: 120,
      render: v => <a onClick={() => openDetail(v)} style={{ fontFamily: 'monospace', fontWeight: 500 }}>{v}</a>,
    },
    {
      title: '供应商名称', dataIndex: 'name', width: 220,
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <a onClick={() => openDetail(r.supplierId)} style={{ fontWeight: 500 }}>{v}</a>
          <Text type="secondary" style={{ fontSize: 11 }}>{r.legalName || ''}</Text>
        </Space>
      ),
    },
    {
      title: '所在国家', dataIndex: 'country', width: 100,
      render: v => <Tag icon={<FlagOutlined />} color="blue">{v}</Tag>,
    },
    {
      title: '风险评分', dataIndex: 'riskScore', width: 180,
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
      title: '风险等级', width: 110, dataIndex: 'riskLevel',
      render: v => {
        const labels = { ...RISK_LABELS, BLACKLISTED: '黑名单' };
        return <Tag color={RISK_COLORS[v] || '#8b0000'} style={{ fontWeight: 600, padding: '2px 10px' }}>{labels[v] || v}</Tag>;
      },
    },
    {
      title: '合规状态', dataIndex: 'complianceStatus', width: 110,
      render: v => {
        const colors = { VERIFIED: 'green', PENDING: 'default', FLAGGED: 'orange', REJECTED: 'red', SUSPENDED: 'purple' };
        const labels = { VERIFIED: '已验证', PENDING: '待审核', FLAGGED: '已标记', REJECTED: '已拒绝', SUSPENDED: '暂停' };
        return <Tag color={colors[v]}>{labels[v] || v}</Tag>;
      },
    },
    { title: '累计交易', dataIndex: 'transactionCount', width: 90, render: v => formatNumber(v || 0) },
    { title: '放行/拒绝', width: 120, render: (_, r) => (
      <Space size={4}>
        <Text type="success">{formatNumber(r.approvedTransactionCount || 0)}</Text>
        <Text type="secondary">/</Text>
        <Text type="danger">{formatNumber(r.rejectedTransactionCount || 0)}</Text>
      </Space>
    ) },
    { title: '拒单数', dataIndex: 'rejectionCount', width: 80, render: v => v > 0 ? <Badge count={v} /> : '0' },
    { title: '制裁命中', dataIndex: 'sanctionHits', width: 80, render: v => v > 0 ? <Text type="danger" strong>{v}</Text> : '0' },
    { title: '最后筛查', dataIndex: 'lastScreeningDate', width: 130, render: v => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    {
      title: '状态', width: 80, dataIndex: 'isActive',
      render: (v, r) => r.blacklisted ? <Tag color="red">⛔ 黑名单</Tag> : v ? <Tag color="green">● 正常</Tag> : <Tag>停用</Tag>,
    },
    {
      title: '操作', width: 180, fixed: 'right',
      render: (_, r) => (
        <Space size={4} wrap>
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(r.supplierId)}>详情</Button>
          <Tooltip title="重新筛查风险">
            <Button size="small" type="link" icon={<SyncOutlined />} onClick={async () => {
              try {
                await api.suppliers.rescreen(r.supplierId);
                message.success('筛查完成');
                loadData(pagination.current, pagination.pageSize);
              } catch { /* handled */ }
            }}>筛查</Button>
          </Tooltip>
          {r.blacklisted
            ? <Button size="small" type="link" icon={<UnlockOutlined />} style={{ color: '#52c41a' }} onClick={() => doUnblock(r)}>解除</Button>
            : <Button size="small" type="link" danger icon={<BlockOutlined />} onClick={() => doBlacklist(r)}>拉黑</Button>
          }
        </Space>
      ),
    },
  ];

  const supplierStats = [
    { title: '供应商总数', value: stats.total, color: '#1677ff', icon: <BankOutlined /> },
    { title: '黑名单', value: stats.blacklisted, color: '#ff4d4f', icon: <BlockOutlined /> },
    {
      title: '高风险', value: (stats.byRisk || []).reduce((s, r) =>
        s + (['HIGH', 'CRITICAL', 'BLACKLISTED'].includes(r._id) ? r.count : 0), 0),
      color: '#fa8c16', icon: <WarningOutlined />,
    },
    {
      title: '中风险', value: (stats.byRisk || []).find(r => r._id === 'MEDIUM')?.count || 0,
      color: '#faad14', icon: <SafetyOutlined />,
    },
  ];

  const riskOption = {
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie', radius: ['40%', '65%'], center: ['50%', '50%'],
      label: { formatter: '{b}: {c}' },
      data: (stats.byRisk || []).map(r => ({
        name: { ...RISK_LABELS, BLACKLISTED: '黑名单' }[r._id] || r._id,
        value: r.count,
        itemStyle: { color: RISK_COLORS[r._id] || '#8b0000' },
      })).filter(r => r.value > 0),
    }],
  };

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        {supplierStats.map((c, i) => (
          <Col xs={12} sm={6} md={6} lg={3} key={i}>
            <Card hoverable style={{ borderRadius: 10, border: 'none' }} bodyStyle={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{c.title}</Text>
                  <div style={{ fontSize: 22, fontWeight: 700, color: c.color, marginTop: 4 }}>{formatNumber(c.value)}</div>
                </div>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${c.color}15`, color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{c.icon}</div>
              </div>
            </Card>
          </Col>
        ))}
        <Col xs={24} md={12} lg={6}>
          <Card style={{ borderRadius: 10, border: 'none', height: '100%' }} bodyStyle={{ padding: 8 }}>
            <ReactECharts option={riskOption} style={{ height: 100 }} />
          </Card>
        </Col>
        <Col xs={24} md={12} lg={6}>
          <Card style={{ borderRadius: 10, border: 'none' }} title={<Text style={{ fontSize: 13 }}>国家分布 TOP 5</Text>} size="small">
            <List
              size="small"
              dataSource={(stats.byCountry || []).slice(0, 5)}
              renderItem={(c, i) => (
                <List.Item key={i}>
                  <span style={{ fontWeight: 600 }}>{c._id}</span>
                  <span style={{ flex: 1, textAlign: 'right' }}>
                    <Text>{formatNumber(c.count)}</Text>
                    {c.highRisk > 0 && <Tag color="red" style={{ marginLeft: 6 }}>高风险 {c.highRisk}</Tag>}
                  </span>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Card
        style={{ borderRadius: 10, marginBottom: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <Space wrap size={10}>
          <Input
            allowClear
            placeholder="名称/ID/注册号搜索..."
            style={{ width: 260 }}
            prefix={<SearchOutlined />}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            onPressEnter={() => loadData(1, pagination.pageSize)}
          />
          <Input
            allowClear
            placeholder="供应商ID精确"
            style={{ width: 140 }}
            prefix={<BankOutlined />}
            onChange={e => setFilters(f => ({ ...f, supplierId: e.target.value }))}
            onPressEnter={() => loadData(1, pagination.pageSize)}
          />
          <Select
            allowClear
            placeholder="风险等级"
            style={{ width: 140 }}
            mode="multiple"
            maxTagCount={2}
            onChange={v => setFilters(f => ({ ...f, riskLevel: v }))}
          >
            {Object.entries({ ...RISK_LABELS, BLACKLISTED: '黑名单' }).map(([k, v]) => (
              <Option key={k} value={k}><Tag color={RISK_COLORS[k] || '#8b0000'}>{v}</Tag></Option>
            ))}
          </Select>
          <Select
            allowClear
            placeholder="合规状态"
            style={{ width: 130 }}
            onChange={v => setFilters(f => ({ ...f, complianceStatus: v }))}
          >
            {['VERIFIED', 'PENDING', 'FLAGGED', 'REJECTED', 'SUSPENDED'].map(s => <Option key={s} value={s}>{s}</Option>)}
          </Select>
          <Input
            allowClear
            placeholder="国家代码"
            style={{ width: 120 }}
            prefix={<FlagOutlined />}
            onChange={e => setFilters(f => ({ ...f, country: e.target.value }))}
            onPressEnter={() => loadData(1, pagination.pageSize)}
          />
          <Select
            placeholder="黑名单状态"
            style={{ width: 130 }}
            allowClear
            onChange={v => setFilters(f => ({ ...f, blacklisted: v }))}
          >
            <Option value="true">黑名单</Option>
            <Option value="false">非黑名单</Option>
          </Select>
          <Space>
            <Button type="primary" icon={<FilterOutlined />} onClick={() => loadData(1, pagination.pageSize)}>查询</Button>
            <Button icon={<ReloadOutlined />} onClick={() => { setFilters({}); loadData(); loadStats(); }}>重置</Button>
          </Space>
        </Space>
      </Card>

      <Card style={{ borderRadius: 10, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }} bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="supplierId"
          loading={loading}
          size="middle"
          scroll={{ x: 1500 }}
          pagination={{
            ...pagination,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: t => `共 ${formatNumber(t)} 家`,
            onChange: (p, s) => loadData(p, s),
          }}
        />
      </Card>

      <Drawer
        title={
          <Space>
            <Avatar style={{ backgroundColor: '#1677ff' }} icon={<TeamOutlined />} />
            <div>
              <Title level={4} style={{ margin: 0 }}>{detail?.supplier?.name || '供应商详情'}</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {detail?.supplier?.supplierId} · {detail?.supplier?.country}
              </Text>
            </div>
            {detail?.supplier?.blacklisted && <Tag color="red" style={{ fontWeight: 600 }}>⛔ 黑名单</Tag>}
            <Tag color={RISK_COLORS[detail?.supplier?.riskLevel]} style={{ fontWeight: 600 }}>
              {RISK_LABELS[detail?.supplier?.riskLevel] || detail?.supplier?.riskLevel} · {detail?.supplier?.riskScore}分
            </Tag>
          </Space>
        }
        open={!!detail}
        onClose={() => setDetail(null)}
        width={920}
        loading={detailLoading}
        extra={
          detail?.supplier && (
            <Space>
              <Button icon={<SyncOutlined />} onClick={async () => {
                try {
                  await api.suppliers.rescreen(detail.supplier.supplierId);
                  message.success('筛查完成');
                  openDetail(detail.supplier.supplierId);
                  loadStats();
                } catch { /* handled */ }
              }}>重新筛查</Button>
              {detail.supplier.blacklisted
                ? <Button type="primary" icon={<UnlockOutlined />} style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={() => doUnblock(detail.supplier)}>解除黑名单</Button>
                : <Button danger icon={<BlockOutlined />} onClick={() => doBlacklist(detail.supplier)}>加入黑名单</Button>
              }
            </Space>
          )
        }
      >
        {detail?.supplier && (
          <div>
            <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
              <Col xs={12} sm={8} md={6}>
                <Card size="small"><Statistic title="累计交易" value={formatNumber(detail.supplier.transactionCount || 0)} /></Card>
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Card size="small"><Statistic title="已放行" value={formatNumber(detail.supplier.approvedTransactionCount || 0)} valueStyle={{ color: '#52c41a' }} /></Card>
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Card size="small"><Statistic title="已拒绝" value={formatNumber(detail.supplier.rejectedTransactionCount || 0)} valueStyle={{ color: '#ff4d4f' }} /></Card>
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Card size="small"><Statistic title="制裁命中" value={detail.supplier.sanctionHits || 0} valueStyle={{ color: '#fa8c16' }} /></Card>
              </Col>
              <Col xs={24} md={24}>
                <Card size="small">
                  <Statistic
                    title={<Space>风险评分<Tag color={RISK_COLORS[detail.supplier.riskLevel]}>{RISK_LABELS[detail.supplier.riskLevel]}</Tag></Space>}
                    value={detail.supplier.riskScore || 0}
                    suffix={
                      <Progress
                        percent={detail.supplier.riskScore || 0}
                        showInfo={false}
                        style={{ width: 200, marginLeft: 12 }}
                        strokeColor={RISK_COLORS[detail.supplier.riskLevel]}
                      />
                    }
                  />
                </Card>
              </Col>
            </Row>

            <Card type="inner" title="基本信息" style={{ marginBottom: 12 }}>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="供应商ID">{detail.supplier.supplierId}</Descriptions.Item>
                <Descriptions.Item label="所在国家"><Tag color="blue">{detail.supplier.country}</Tag></Descriptions.Item>
                <Descriptions.Item label="公司名称" span={2}>{detail.supplier.name}</Descriptions.Item>
                <Descriptions.Item label="法定名称" span={2}>{detail.supplier.legalName || '-'}</Descriptions.Item>
                {detail.supplier.alternateNames?.length > 0 && (
                  <Descriptions.Item label="别名" span={2}>
                    {detail.supplier.alternateNames.map(n => <Tag key={n}>{n}</Tag>)}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="注册号">{detail.supplier.registrationNumber || '-'}</Descriptions.Item>
                <Descriptions.Item label="税号">{detail.supplier.taxId || '-'}</Descriptions.Item>
                <Descriptions.Item label="VAT号">{detail.supplier.vatNumber || '-'}</Descriptions.Item>
                <Descriptions.Item label="经营国家">
                  {detail.supplier.countriesOfOperation?.map(c => <Tag key={c} color="purple">{c}</Tag>) || '-'}
                </Descriptions.Item>
                {detail.supplier.address && (
                  <Descriptions.Item label="地址" span={2}>
                    {detail.supplier.address.line1} {detail.supplier.address.line2 || ''}，
                    {detail.supplier.address.city} {detail.supplier.address.state || ''}
                    {detail.supplier.address.postalCode && ` ${detail.supplier.address.postalCode}`}
                    {detail.supplier.address.country && ` ${detail.supplier.address.country}`}
                  </Descriptions.Item>
                )}
                {detail.supplier.contactInfo && (
                  <>
                    <Descriptions.Item label="主要联系人">{detail.supplier.contactInfo.primaryContact || '-'}</Descriptions.Item>
                    <Descriptions.Item label="邮箱">{detail.supplier.contactInfo.email || '-'}</Descriptions.Item>
                    <Descriptions.Item label="电话">{detail.supplier.contactInfo.phone || '-'}</Descriptions.Item>
                    <Descriptions.Item label="网站">{detail.supplier.contactInfo.website || '-'}</Descriptions.Item>
                  </>
                )}
                {detail.supplier.tags?.length > 0 && (
                  <Descriptions.Item label="标签" span={2}>
                    {detail.supplier.tags.map(t => <Tag key={t} color="geekblue">{t}</Tag>)}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="合规状态">
                  <Tag color={detail.supplier.complianceStatus === 'VERIFIED' ? 'green'
                    : detail.supplier.complianceStatus === 'FLAGGED' ? 'orange'
                      : detail.supplier.complianceStatus === 'REJECTED' ? 'red' : 'default'}>
                    {detail.supplier.complianceStatus}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  {detail.supplier.blacklisted ? <Tag color="red">黑名单</Tag>
                    : detail.supplier.isActive ? <Tag color="green">● 正常</Tag>
                      : <Tag>已停用</Tag>}
                </Descriptions.Item>
                {detail.supplier.blacklisted && (
                  <>
                    <Descriptions.Item label="拉黑原因" span={2}>{detail.supplier.blacklistReason}</Descriptions.Item>
                    <Descriptions.Item label="拉黑时间">{detail.supplier.blacklistedAt ? dayjs(detail.supplier.blacklistedAt).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
                    <Descriptions.Item label="最近筛查">{detail.supplier.lastScreeningDate ? dayjs(detail.supplier.lastScreeningDate).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
                  </>
                )}
              </Descriptions>
            </Card>

            {detail.supplier.beneficialOwners?.length > 0 && (
              <Card type="inner" title="实际受益人信息" size="small" style={{ marginBottom: 12 }}>
                <List
                  size="small"
                  bordered
                  dataSource={detail.supplier.beneficialOwners}
                  renderItem={(bo, i) => (
                    <List.Item key={i}>
                      <List.Item.Meta
                        avatar={<Avatar icon={<UserOutlined />} />}
                        title={bo.name}
                        description={`国籍: ${bo.nationality || '-'} · 持股: ${bo.ownershipPercentage || 0}%`}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            )}

            {detail.supplier.dueDiligence && (
              <Card type="inner" title="尽职调查信息" size="small" style={{ marginBottom: 12 }}>
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="DD等级">{detail.supplier.dueDiligence.level || '-'}</Descriptions.Item>
                  <Descriptions.Item label="完成时间">{detail.supplier.dueDiligence.completedAt ? dayjs(detail.supplier.dueDiligence.completedAt).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
                  <Descriptions.Item label="调查结果" span={2}>{detail.supplier.dueDiligence.findings || '-'}</Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            {detail.supplier.notes && (
              <Card type="inner" title="备注" size="small" style={{ marginBottom: 12 }}>
                {detail.supplier.notes}
              </Card>
            )}

            <Card type="inner" title={<Space><HistoryOutlined />最近交易记录 ({detail.recentTransactions?.length || 0})</Space>} style={{ marginBottom: 12 }}>
              {detail.recentTransactions?.length > 0 ? (
                <Table
                  size="small"
                  pagination={false}
                  dataSource={detail.recentTransactions}
                  rowKey="_id"
                  columns={[
                    {
                      title: '交易编号', dataIndex: 'transactionId', width: 160,
                      render: v => <a onClick={() => navigate(`/transactions/${v}`)} style={{ fontFamily: 'monospace' }}>{v}</a>,
                    },
                    { title: '日期', dataIndex: 'orderDate', width: 140, render: v => dayjs(v).format('YYYY-MM-DD HH:mm') },
                    { title: '商品', dataIndex: 'hsDescription', width: 150 },
                    {
                      title: '风险', width: 130, dataIndex: 'riskScore',
                      render: (v, r) => (
                        <Progress percent={v} size="small" strokeColor={RISK_COLORS[r.riskLevel]} format={p => <span style={{ color: RISK_COLORS[r.riskLevel], fontWeight: 600 }}>{p}</span>} />
                      ),
                    },
                    {
                      title: '状态', dataIndex: 'status', width: 100,
                      render: v => {
                        const m = { APPROVED: 'green', REJECTED: 'red', UNDER_REVIEW: 'processing', FROZEN: 'warning', SCREENED: 'blue', PENDING_SCREENING: 'default' };
                        return <Tag color={m[v]}>{v}</Tag>;
                      },
                    },
                    { title: '金额', width: 120, render: (_, r) => formatCurrency(r.totalAmount, r.currency) },
                  ]}
                />
              ) : <Empty description="暂无交易记录" />}
            </Card>

            <Card type="inner" title={<Space><SwapOutlined />交易统计汇总</Space>} style={{ marginBottom: 12 }}>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="交易笔数">{formatNumber(detail.transactionStats?.total || 0)} 笔</Descriptions.Item>
                <Descriptions.Item label="累计金额">{formatCurrency(detail.transactionStats?.totalAmount || 0, 'USD')}</Descriptions.Item>
                <Descriptions.Item label="已放行"><Text type="success">{formatNumber(detail.transactionStats?.approved || 0)}</Text></Descriptions.Item>
                <Descriptions.Item label="已拒绝"><Text type="danger">{formatNumber(detail.transactionStats?.rejected || 0)}</Text></Descriptions.Item>
                <Descriptions.Item label="制裁命中笔数" span={2}>
                  {detail.transactionStats?.hitCount > 0
                    ? <Text type="danger" strong>{formatNumber(detail.transactionStats.hitCount)}</Text>
                    : 0}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {detail.auditLogs?.length > 0 && (
              <Card type="inner" title={<Space><HistoryOutlined />操作历史</Space>}>
                <List
                  size="small"
                  bordered
                  dataSource={detail.auditLogs.slice(0, 30)}
                  renderItem={(log, i) => (
                    <List.Item key={i}>
                      <List.Item.Meta
                        avatar={<Avatar size="small" style={{ background: '#1677ff' }}>{(log.userName || 'S')[0].toUpperCase()}</Avatar>}
                        title={<Space><Tag color="blue">{log.category}</Tag><Text strong>{log.action}</Text></Space>}
                        description={
                          <div style={{ fontSize: 12 }}>
                            <Text type="secondary">{dayjs(log.timestamp).format('YYYY-MM-DD HH:mm:ss')}</Text>
                            {' · '}
                            {log.userName || '系统'}
                            <br />
                            {log.description}
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              </Card>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
