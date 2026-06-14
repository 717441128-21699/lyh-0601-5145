import React, { useState, useEffect, useRef } from 'react';
import {
  Card, Table, Tag, Input, Button, Space, Form, Select, DatePicker,
  Progress, Modal, Descriptions, App, Drawer, Tooltip, Divider, Dropdown, Statistic,
  Typography, Row, Col, Empty, FloatButton, Badge,
} from 'antd';
import {
  SearchOutlined,
  FilterOutlined,
  DownloadOutlined,
  ReloadOutlined,
  EyeOutlined,
  LockOutlined,
  UnlockOutlined,
  ExportOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  SyncOutlined,
  FileSearchOutlined,
  PlusOutlined,
  InfoCircleOutlined,
  RiseOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import {
  RISK_COLORS, RISK_LABELS, TRANSACTION_STATUS_COLORS, TRANSACTION_STATUS_LABELS,
  COUNTRIES, formatCurrency, formatNumber, formatPercent,
} from '../store';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Text, Title } = Typography;

export default function Transactions() {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({});
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50 });
  const [detailDrawer, setDetailDrawer] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [historyData, setHistoryData] = useState({});
  const [syncLoading, setSyncLoading] = useState(false);

  const [filterParams, setFilterParams] = useState({});
  const [form] = Form.useForm();

  const loadData = async (page = 1, pageSize = 50, extra = {}) => {
    setLoading(true);
    try {
      const params = {
        ...filterParams,
        ...extra,
        page,
        pageSize,
        sortBy: 'orderDate',
        sortOrder: 'desc',
      };
      const res = await api.transactions.search(params);
      setData(res.items);
      setSummary(res.summary || {});
      setTotal(res.total);
      setPagination({ current: page, pageSize });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(1, 50);
  }, []);

  const doSearch = () => {
    const v = form.getFieldsValue();
    const params = {};
    if (v.keyword) {
      if (v.keyword.startsWith('TXN-')) params.transactionId = v.keyword;
      else if (v.keyword.startsWith('PO-')) params.poNumber = v.keyword;
      else if (v.keyword.startsWith('SUP-')) params.supplierId = v.keyword;
      else params.supplierName = v.keyword;
    }
    if (v.riskLevel) params.riskLevel = v.riskLevel;
    if (v.status) params.status = v.status;
    if (v.country) params.originCountry = v.country;
    if (v.hsCode) params.hsCode = v.hsCode;
    if (v.dateRange && v.dateRange.length === 2) {
      params.startDate = v.dateRange[0].startOf('day').toISOString();
      params.endDate = v.dateRange[1].endOf('day').toISOString();
    }
    if (v.hasMatch) params.hasSanctionMatch = v.hasMatch === 'true';
    setFilterParams(params);
    loadData(1, pagination.pageSize, params);
  };

  const resetFilter = () => {
    form.resetFields();
    setFilterParams({});
    loadData(1, pagination.pageSize);
  };

  const exportData = async (format = 'xlsx') => {
    setExporting(true);
    try {
      const res = await api.transactions.export({
        ...filterParams,
        ...pagination,
      }, format);
      message.success(`导出完成，共 ${res.count} 条记录`);
      window.open(res.downloadUrl, '_blank');
    } finally {
      setExporting(false);
    }
  };

  const openDetail = async (txnId) => {
    setDetailDrawer(txnId);
    setDetailLoading(true);
    try {
      const [detail, history] = await Promise.all([
        api.transactions.get(txnId),
        api.transactions.history(txnId),
      ]);
      setDetailData(detail);
      setHistoryData(history);
    } catch {
      message.error('获取详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const rescreenTxn = async (txnId) => {
    try {
      await api.transactions.rescreen(txnId);
      message.success('已提交重新筛查');
      setTimeout(() => loadData(pagination.current, pagination.pageSize), 1000);
    } catch { /* handled */ }
  };

  const manualFreeze = async (txnId, freeze = true) => {
    modal.confirm({
      title: freeze ? '确认冻结交易?' : '确认放交易?',
      content: `交易编号: ${txnId}`,
      okText: freeze ? '冻结' : '放行',
      okButtonProps: { danger: freeze },
      onOk: async () => {
        try {
          if (freeze) await api.transactions.freeze(txnId, '手工冻结');
          else await api.transactions.release(txnId, '手工放行');
          message.success(freeze ? '已冻结' : '已放行');
          loadData(pagination.current, pagination.pageSize);
        } catch { /* handled */ }
      },
    });
  };

  const syncData = async (incremental = false) => {
    setSyncLoading(true);
    try {
      const res = await api.transactions.sync(incremental);
      message.success(`同步完成: 新增 ${res.new || 0} 条`);
      loadData(1, pagination.pageSize);
    } finally {
      setSyncLoading(false);
    }
  };

  const columns = [
    {
      title: '交易编号', dataIndex: 'transactionId', key: 'transactionId', width: 200, fixed: 'left',
      render: (v, r) => (
        <Space>
          <a onClick={() => openDetail(v)} style={{ fontFamily: 'monospace', fontWeight: 500 }}>{v}</a>
          {r.sanctionMatches?.length > 0 && (
            <Tooltip title={`命中 ${r.sanctionMatches.length} 条制裁`}>
              <Badge count={r.sanctionMatches.length} size="small" style={{ backgroundColor: '#ff4d4f' }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    { title: 'PO编号', dataIndex: 'poNumber', width: 130, render: v => <Text code>{v}</Text> },
    { title: '订单日期', dataIndex: 'orderDate', width: 140, render: v => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '供应商', dataIndex: 'supplierName', width: 180,
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <a onClick={() => navigate(`/suppliers/${r.supplierId}`)}>{v}</a>
          <Text type="secondary" style={{ fontSize: 11 }}>{r.supplierId} · {r.supplierCountry}</Text>
        </Space>
      ),
    },
    { title: 'HS编码', dataIndex: 'hsCode', width: 110, render: v => <Text code>{v}</Text> },
    { title: '商品', dataIndex: 'hsDescription', width: 150, ellipsis: true },
    { title: '原产地 / 目的国', width: 130, render: (_, r) => (
      <Space direction="vertical" size={0} style={{ fontSize: 12 }}>
        <span>🇸 始发: {COUNTRIES[r.originCountry] || r.originCountry}</span>
        <span>🇩 目的: {COUNTRIES[r.destinationCountry] || r.destinationCountry}</span>
      </Space>
    ) },
    { title: '最终用户', dataIndex: 'endUser', width: 150, ellipsis: true },
    {
      title: '金额', width: 140, render: (_, r) => (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 600 }}>{formatCurrency(r.totalAmount, r.currency)}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>×{formatNumber(r.quantity)} 件</Text>
        </div>
      ),
    },
    {
      title: '风险评分', width: 160, dataIndex: 'riskScore',
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
      title: '状态', width: 100, dataIndex: 'status',
      render: v => <Tag color={TRANSACTION_STATUS_COLORS[v]} style={{ padding: '2px 10px' }}>{TRANSACTION_STATUS_LABELS[v] || v}</Tag>,
    },
    {
      title: '操作', width: 200, fixed: 'right',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(r.transactionId)}>详情</Button>
          <Tooltip title="重新筛查">
            <Button size="small" type="link" icon={<SyncOutlined />} onClick={() => rescreenTxn(r.transactionId)}>筛查</Button>
          </Tooltip>
          {r.frozen
            ? <Button size="small" type="link" icon={<UnlockOutlined />} onClick={() => manualFreeze(r.transactionId, false)}>放行</Button>
            : <Button size="small" type="link" danger icon={<LockOutlined />} onClick={() => manualFreeze(r.transactionId, true)}>冻结</Button>
          }
          <Tooltip title="生成审查工单">
            <Button
              size="small" type="link" icon={<FileSearchOutlined />}
              onClick={async () => {
                try {
                  await api.transactions.createReview({ transactionId: r.transactionId });
                  message.success('工单已生成');
                  loadData(pagination.current, pagination.pageSize);
                } catch { /* handled */ }
              }}
            >工单</Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const RiskLegend = ({ label, color, count }) => (
    <Space>
      <span style={{ display: 'inline-block', width: 10, height: 10, background: color, borderRadius: 2 }} />
      <Text style={{ fontSize: 12 }}>{label}</Text>
      <Text strong style={{ fontSize: 14, color }}>{formatNumber(count)}</Text>
    </Space>
  );

  return (
    <div>
      <Card
        style={{ borderRadius: 10, marginBottom: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <Form form={form} layout="inline" onFinish={doSearch} style={{ rowGap: 8 }}>
          <Form.Item name="keyword">
            <Input allowClear placeholder="交易号/PO/供应商/搜索..." style={{ width: 240 }} prefix={<SearchOutlined />} />
          </Form.Item>
          <Form.Item name="hsCode">
            <Input allowClear placeholder="HS编码" style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="country">
            <Select allowClear placeholder="始发国家" style={{ width: 140 }} showSearch optionFilterProp="label">
              {Object.entries(COUNTRIES).map(([code, name]) => (
                <Option key={code} value={code} label={name}>{name} ({code})</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="riskLevel">
            <Select allowClear placeholder="风险等级" style={{ width: 130 }} mode="multiple" maxTagCount={2}>
              {Object.entries(RISK_LABELS).map(([k, v]) => (
                <Option key={k} value={k}><Tag color={RISK_COLORS[k]}>{v}</Tag></Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="status">
            <Select allowClear placeholder="状态" style={{ width: 130 }} mode="multiple" maxTagCount={2}>
              {Object.entries(TRANSACTION_STATUS_LABELS).map(([k, v]) => (
                <Option key={k} value={k}>{v}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="hasMatch">
            <Select allowClear placeholder="制裁命中" style={{ width: 120 }}>
              <Option value="true">已命中</Option>
              <Option value="false">未命中</Option>
            </Select>
          </Form.Item>
          <Form.Item name="dateRange">
            <RangePicker showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm" />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查询</Button>
            <Button icon={<ReloadOutlined />} onClick={resetFilter}>重置</Button>
            <Dropdown menu={{
              items: [
                { key: 'excel', icon: <FileExcelOutlined />, label: `导出 Excel (${formatNumber(summary.total || total)})`, onClick: () => exportData('xlsx') },
                { key: 'csv', icon: <FileTextOutlined />, label: `导出 CSV (${formatNumber(summary.total || total)})`, onClick: () => exportData('csv') },
              ],
            }}>
              <Button icon={<DownloadOutlined />} loading={exporting}>批量导出</Button>
            </Dropdown>
            <Dropdown menu={{
              items: [
                { key: 'full', icon: <RiseOutlined />, label: '全量同步', onClick: () => syncData(false) },
                { key: 'incr', icon: <SyncOutlined spin={syncLoading} />, label: '增量同步 (近4小时)', onClick: () => syncData(true) },
              ],
            }}>
              <Button type="dashed" icon={<PlusOutlined />} loading={syncLoading}>同步数据</Button>
            </Dropdown>
          </Space>
        </Form>
      </Card>

      <Card
        style={{ borderRadius: 10, marginBottom: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
        bodyStyle={{ padding: '10px 16px' }}
      >
        <Row gutter={16} style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
          <Col flex="180px" style={{ minWidth: 150 }}>
            <Statistic title="查询结果" value={summary.total || total} suffix="笔" />
          </Col>
          <Divider type="vertical" style={{ height: 50 }} />
          <Col flex="180px"><RiskLegend color={RISK_COLORS.LOW} label={RISK_LABELS.LOW} count={summary.riskLevelBreakdown?.LOW || 0} /></Col>
          <Col flex="180px"><RiskLegend color={RISK_COLORS.MEDIUM} label={RISK_LABELS.MEDIUM} count={summary.riskLevelBreakdown?.MEDIUM || 0} /></Col>
          <Col flex="180px"><RiskLegend color={RISK_COLORS.HIGH} label={RISK_LABELS.HIGH} count={summary.riskLevelBreakdown?.HIGH || 0} /></Col>
          <Col flex="180px"><RiskLegend color={RISK_COLORS.CRITICAL} label={RISK_LABELS.CRITICAL} count={summary.riskLevelBreakdown?.CRITICAL || 0} /></Col>
          <Divider type="vertical" style={{ height: 50 }} />
          <Col flex="200px"><Statistic title="命中制裁" value={summary.sanctionMatchCount || 0} valueStyle={{ color: '#ff4d4f' }} suffix="笔" /></Col>
          <Col flex="220px"><Statistic title="平均风险分" value={summary.avgRiskScore || 0} valueStyle={{ color: '#fa8c16' }} suffix="/100" precision={1} /></Col>
        </Row>
      </Card>

      <Card style={{ borderRadius: 10, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }} bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="transactionId"
          loading={loading}
          size="middle"
          scroll={{ x: 1800 }}
          pagination={{
            ...pagination,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: t => `共 ${formatNumber(t)} 条`,
            pageSizeOptions: ['20', '50', '100', '200', '500'],
            onChange: (page, pageSize) => loadData(page, pageSize),
          }}
        />
      </Card>

      <Drawer
        title={<Space><InfoCircleOutlined style={{ color: '#1677ff' }} />交易详情<div style={{ fontWeight: 400, fontSize: 14 }}><Text code>{detailDrawer}</Text></div></Space>}
        open={!!detailDrawer}
        onClose={() => setDetailDrawer(null)}
        width={900}
        loading={detailLoading}
        extra={<Space>
          {detailData && !detailData.frozen && <Button danger icon={<LockOutlined />} onClick={() => { manualFreeze(detailDrawer, true); setDetailLoading(true); }}>冻结</Button>}
          {detailData?.frozen && <Button type="primary" icon={<UnlockOutlined />} onClick={() => { manualFreeze(detailDrawer, false); setDetailLoading(true); }}>放行</Button>}
          <Button icon={<SyncOutlined />} onClick={() => { rescreenTxn(detailDrawer); setDetailLoading(true); }}>重新筛查</Button>
        </Space>}
      >
        {detailData && (
          <div>
            <Card type="inner" title="基础信息" style={{ marginBottom: 12 }}>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="交易编号">{detailData.transactionId}</Descriptions.Item>
                <Descriptions.Item label="PO编号">{detailData.poNumber}</Descriptions.Item>
                <Descriptions.Item label="订单日期">{dayjs(detailData.orderDate).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
                <Descriptions.Item label="总金额">{formatCurrency(detailData.totalAmount, detailData.currency)}</Descriptions.Item>
                <Descriptions.Item label="供应商" span={2}>
                  {detailData.supplierName}（{detailData.supplierId}） · {detailData.supplierCountry}
                </Descriptions.Item>
                <Descriptions.Item label="HS编码">{detailData.hsCode}</Descriptions.Item>
                <Descriptions.Item label="商品描述">{detailData.hsDescription}</Descriptions.Item>
                <Descriptions.Item label="原产地">{COUNTRIES[detailData.originCountry] || detailData.originCountry}</Descriptions.Item>
                <Descriptions.Item label="目的国">{COUNTRIES[detailData.destinationCountry] || detailData.destinationCountry}</Descriptions.Item>
                <Descriptions.Item label="最终用户" span={2}>{detailData.endUser}（{COUNTRIES[detailData.endUserCountry] || detailData.endUserCountry}）</Descriptions.Item>
                <Descriptions.Item label="数量/单价">{formatNumber(detailData.quantity)}件 × {formatCurrency(detailData.unitPrice, detailData.currency)}</Descriptions.Item>
                <Descriptions.Item label="产品描述">{detailData.productDescription}</Descriptions.Item>
              </Descriptions>
            </Card>

            <Card type="inner" title={
              <Space>
                <WarningOutlined style={{ color: RISK_COLORS[detailData.riskLevel] }} />
                风险评估结果
                <Tag color={RISK_COLORS[detailData.riskLevel]} style={{ fontWeight: 600 }}>
                  {RISK_LABELS[detailData.riskLevel]} · {detailData.riskScore}/100
                </Tag>
              </Space>
            } style={{ marginBottom: 12 }}>
              <Progress
                percent={detailData.riskScore}
                strokeColor={RISK_COLORS[detailData.riskLevel]}
                showInfo={false}
                style={{ marginBottom: 12 }}
              />
              <Title level={5} style={{ marginTop: 0 }}>制裁名单命中 ({detailData.sanctionMatches?.length || 0})</Title>
              {detailData.sanctionMatches?.length > 0 ? (
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(r, i) => i}
                  dataSource={detailData.sanctionMatches}
                  columns={[
                    { title: '名单类型', dataIndex: 'listName', width: 120 },
                    { title: '匹配字段', dataIndex: 'matchedField', width: 140 },
                    { title: '匹配值', dataIndex: 'matchValue' },
                    {
                      title: '匹配度', dataIndex: 'matchScore', width: 140,
                      render: v => <Progress percent={v} size="small" />,
                    },
                  ]}
                />
              ) : <Empty description="无制裁命中" image={Empty.PRESENTED_IMAGE_SIMPLE} />}

              <Divider style={{ margin: '16px 0' }} />
              <Title level={5}>风险因子</Title>
              {detailData.riskFactors?.length > 0 ? (
                detailData.riskFactors.map((f, i) => (
                  <div key={i} style={{ display: 'flex', marginBottom: 6, padding: '6px 10px', background: '#fafafa', borderRadius: 4 }}>
                    <Tag color="orange" style={{ minWidth: 100 }}>{f.type}</Tag>
                    <Text>{f.description}</Text>
                    <Tag style={{ marginLeft: 'auto' }} color="red">{f.score} 分</Tag>
                  </div>
                ))
              ) : <Empty description="无触发风险因子" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
            </Card>

            <Card type="inner" title={
              <Space>
                <FileSearchOutlined />
                审查状态
                <Tag color={TRANSACTION_STATUS_COLORS[detailData.status]} style={{ fontWeight: 600 }}>
                  {TRANSACTION_STATUS_LABELS[detailData.status]}
                </Tag>
                {detailData.frozen && <Tag color="red">已冻结</Tag>}
              </Space>
            } style={{ marginBottom: 12 }}>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="冻结时间">{detailData.frozenAt ? dayjs(detailData.frozenAt).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
                <Descriptions.Item label="放行时间">{detailData.releasedAt ? dayjs(detailData.releasedAt).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
                <Descriptions.Item label="审查人">{detailData.reviewedBy || '-'}</Descriptions.Item>
                <Descriptions.Item label="审查时间">{detailData.reviewedAt ? dayjs(detailData.reviewedAt).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
                <Descriptions.Item label="拒绝原因" span={2}>{detailData.rejectionReason || '-'}</Descriptions.Item>
                <Descriptions.Item label="审查备注" span={2}>{detailData.reviewNotes || '-'}</Descriptions.Item>
                {detailData.reviewId && (
                  <Descriptions.Item label="工单号" span={2}>
                    <a onClick={() => navigate(`/reviews/${detailData.reviewId}`)}>查看关联工单 →</a>
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Card>

            <Card type="inner" title="操作历史">
              {historyData.auditLogs?.length > 0 ? (
                <Table
                  size="small"
                  pagination={false}
                  dataSource={historyData.auditLogs}
                  rowKey="logId"
                  columns={[
                    { title: '时间', dataIndex: 'timestamp', width: 160, render: v => dayjs(v).format('YYYY-MM-DD HH:mm:ss') },
                    { title: '类型', dataIndex: 'category', width: 110, render: v => <Tag>{v}</Tag> },
                    { title: '操作', dataIndex: 'action', width: 200 },
                    { title: '用户', dataIndex: 'userName', width: 110, render: v => v || '系统' },
                    { title: '描述', dataIndex: 'description' },
                    {
                      title: '结果', dataIndex: 'status', width: 80,
                      render: v => <Tag color={v === 'SUCCESS' ? 'green' : 'red'}>{v}</Tag>,
                    },
                  ]}
                />
              ) : <Empty description="暂无操作记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
            </Card>
          </div>
        )}
      </Drawer>

      <FloatButton.Group trigger="hover" type="primary" icon={<ExportOutlined />}>
        <FloatButton icon={<FileExcelOutlined />} tooltip="导出当前筛选结果 (Excel)" onClick={() => exportData('xlsx')} />
        <FloatButton icon={<FileTextOutlined />} tooltip="导出当前筛选结果 (CSV)" onClick={() => exportData('csv')} />
        <FloatButton icon={<ReloadOutlined />} tooltip="刷新数据" onClick={() => loadData(pagination.current, pagination.pageSize)} />
        <FloatButton.BackTop visibilityHeight={200} />
      </FloatButton.Group>
    </div>
  );
}
