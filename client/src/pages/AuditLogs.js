import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, Table, Button, DatePicker, Select, Space, Tag, Drawer, Descriptions,
  message, Spin, Empty, Row, Col, Statistic, Progress, Input, Badge, List,
  Divider, Collapse, Timeline, Tooltip,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, DownloadOutlined, EyeOutlined,
  FileTextOutlined, UserOutlined, ExclamationCircleOutlined,
  SafetyOutlined, ThunderboltOutlined, FileSearchOutlined,
  ClockCircleOutlined, DatabaseOutlined, SettingOutlined,
  LockOutlined, UnlockOutlined, TeamOutlined, FileProtectOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../services/api';
import { useUserStore, formatNumber } from '../store';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { TextArea } = Input;

const SEVERITY_COLORS = {
  DEBUG: 'default',
  INFO: 'blue',
  WARNING: 'orange',
  ERROR: 'red',
  CRITICAL: '#8b0000',
};

const SEVERITY_LABELS = {
  DEBUG: '调试',
  INFO: '信息',
  WARNING: '警告',
  ERROR: '错误',
  CRITICAL: '严重',
};

const CATEGORY_ICONS: Record<string, any> = {
  AUTH: <LockOutlined />,
  USER: <TeamOutlined />,
  TRANSACTION: <DatabaseOutlined />,
  SANCTION: <SafetyOutlined />,
  REVIEW: <FileProtectOutlined />,
  REPORT: <FileTextOutlined />,
  SUPPLIER: <TeamOutlined />,
  SETTING: <SettingOutlined />,
  EXPORT: <DownloadOutlined />,
  UPLOAD: <FileSearchOutlined />,
  NOTIFICATION: <ThunderboltOutlined />,
  SYSTEM: <SettingOutlined />,
};

const CATEGORY_LABELS: Record<string, string> = {
  AUTH: '认证登录',
  USER: '用户管理',
  TRANSACTION: '交易筛查',
  SANCTION: '制裁名单',
  REVIEW: '合规审查',
  REPORT: '统计报告',
  SUPPLIER: '供应商管理',
  SETTING: '系统设置',
  EXPORT: '数据导出',
  UPLOAD: '数据上传',
  NOTIFICATION: '通知推送',
  SYSTEM: '系统事件',
};

interface AuditRecord {
  _id: string;
  category: string;
  action: string;
  severity: string;
  user: { name: string; username: string; role: string };
  ip: string;
  userAgent: string;
  resourceType: string;
  resourceId: string;
  description: string;
  details: any;
  beforeSnapshot: any;
  afterSnapshot: any;
  createdAt: string;
}

const AuditLogs: React.FC = () => {
  const hasPermission = useUserStore((s) => s.hasPermission);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AuditRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<any>({
    category: undefined, severity: undefined, action: undefined,
    userId: undefined, dateRange: undefined, keyword: undefined,
  });
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<AuditRecord | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [exporting, setExporting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = { page, pageSize };
      if (filters.category) params.category = filters.category;
      if (filters.severity) params.severity = filters.severity;
      if (filters.action) params.action = filters.action;
      if (filters.userId) params.userId = filters.userId;
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.dateRange?.length === 2) {
        params.startDate = filters.dateRange[0].startOf('day').toISOString();
        params.endDate = filters.dateRange[1].endOf('day').toISOString();
      }
      const res: any = await api.audit.list(params);
      setData(res.logs || []);
      setTotal(res.total || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchSummary = async () => {
    try {
      const params: any = {};
      if (filters.dateRange?.length === 2) {
        params.startDate = filters.dateRange[0].startOf('day').toISOString();
        params.endDate = filters.dateRange[1].endOf('day').toISOString();
      }
      const [sumRes, catRes] = await Promise.all([
        api.audit.summary(params),
        api.audit.categories(),
      ]);
      setSummary(sumRes);
      setCategories(catRes as any[]);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { fetchData(); }, [page, pageSize]);
  useEffect(() => { fetchSummary(); }, [filters.dateRange]);

  const handleSearch = () => { setPage(1); fetchData(); fetchSummary(); };

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    try {
      const res: any = await api.audit.get(id);
      setDetail(res);
    } catch (e) { message.error('加载日志详情失败'); }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const payload: any = {};
      if (filters.category) payload.category = filters.category;
      if (filters.severity) payload.severity = filters.severity;
      if (filters.dateRange?.length === 2) {
        payload.startDate = filters.dateRange[0].startOf('day').toISOString();
        payload.endDate = filters.dateRange[1].endOf('day').toISOString();
      }
      if (filters.keyword) payload.keyword = filters.keyword;

      const res: any = await api.audit.export(payload);
      if (res.downloadUrl) {
        const token = localStorage.getItem('token');
        const a = document.createElement('a');
        a.href = `${res.downloadUrl}?token=${token}`;
        a.download = `audit_logs_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
      message.success('导出任务已完成');
    } catch (e: any) {
      message.error(e.response?.data?.error || '导出失败');
    } finally { setExporting(false); }
  };

  const categoryBarOption = useMemo(() => {
    if (!categories?.length) return {};
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 90, right: 20, top: 10, bottom: 20 },
      xAxis: { type: 'value' },
      yAxis: {
        type: 'category',
        data: categories.map((c) => CATEGORY_LABELS[c._id] || c._id),
      },
      series: [{
        type: 'bar', barWidth: '65%',
        itemStyle: {
          color: '#1677ff', borderRadius: [0, 4, 4, 0],
        },
        data: categories.map((c) => c.count),
        label: { show: true, position: 'right', fontSize: 11 },
      }],
    };
  }, [categories]);

  const severityPieOption = useMemo(() => {
    if (!summary?.bySeverity) return {};
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, type: 'scroll' },
      series: [{
        type: 'pie', radius: ['45%', '70%'], center: ['50%', '45%'],
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data: Object.entries(summary.bySeverity || {}).map(([k, v]: any) => ({
          name: SEVERITY_LABELS[k] || k,
          value: v,
          itemStyle: { color: SEVERITY_COLORS[k] },
        })),
      }],
    };
  }, [summary]);

  const columns: ColumnsType<AuditRecord> = [
    {
      title: '时间', dataIndex: 'createdAt', width: 170, fixed: 'left',
      render: (v) => (
        <Space>
          <ClockCircleOutlined className="text-gray-400" />
          <span className="font-mono text-xs">{dayjs(v).format('YYYY-MM-DD HH:mm:ss')}</span>
        </Space>
      ),
      defaultSortOrder: 'descend',
      sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    },
    {
      title: '分类', dataIndex: 'category', width: 110,
      render: (v) => (
        <Space>
          <span className="text-gray-500">{CATEGORY_ICONS[v]}</span>
          <Tag color="geekblue">{CATEGORY_LABELS[v] || v}</Tag>
        </Space>
      ),
    },
    {
      title: '操作', dataIndex: 'action', width: 130,
      render: (v) => <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{v}</code>,
    },
    {
      title: '严重级别', dataIndex: 'severity', width: 100, align: 'center',
      render: (v) => {
        if (v === 'CRITICAL') {
          return <Badge status="error" color={SEVERITY_COLORS[v]} text={<span className="font-bold text-red-700">{SEVERITY_LABELS[v]}</span>} />;
        }
        return <Tag color={SEVERITY_COLORS[v]}>{SEVERITY_LABELS[v]}</Tag>;
      },
    },
    {
      title: '用户', dataIndex: ['user', 'name'], width: 110,
      render: (v, r) => (
        <Space>
          <UserOutlined className="text-blue-500" />
          <div className="leading-tight">
            <div className="text-sm font-medium">{v || '-'}</div>
            <div className="text-xs text-gray-500">{r.user?.username || ''}</div>
          </div>
        </Space>
      ),
    },
    {
      title: 'IP地址', dataIndex: 'ip', width: 130,
      render: (v) => v ? <code className="text-xs text-gray-600">{v}</code> : '-',
    },
    {
      title: '描述', dataIndex: 'description',
      ellipsis: true,
      render: (v) => (
        <Tooltip title={v}>
          <span className="text-sm">{v}</span>
        </Tooltip>
      ),
    },
    {
      title: '操作', width: 90, fixed: 'right',
      render: (_, r) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r._id)}>
          详情
        </Button>
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
              title="操作总数"
              value={summary?.total || 0}
              prefix={<FileTextOutlined className="text-blue-500" />}
              formatter={formatNumber}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="!rounded-xl shadow-sm border-l-4 border-orange-500">
            <Statistic
              title="警告级别"
              value={summary?.bySeverity?.WARNING || 0}
              valueStyle={{ color: '#faad14' }}
              prefix={<ExclamationCircleOutlined />}
              formatter={formatNumber}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="!rounded-xl shadow-sm border-l-4 border-red-500">
            <Statistic
              title="错误级别"
              value={(summary?.bySeverity?.ERROR || 0) + (summary?.bySeverity?.CRITICAL || 0)}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<ThunderboltOutlined />}
              formatter={formatNumber}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="!rounded-xl shadow-sm border-l-4 border-green-500">
            <Statistic
              title="唯一用户"
              value={summary?.uniqueUsers || 0}
              prefix={<TeamOutlined className="text-green-500" />}
              formatter={formatNumber}
            />
          </Card>
        </Col>
      </Row>

      {/* 图表 */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={14}>
          <Card size="small" title="操作分类统计" className="!rounded-lg shadow-sm">
            {categories?.length ? (
              <ReactECharts option={categoryBarOption} style={{ height: 240 }} notMerge />
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card size="small" title="严重级别分布" className="!rounded-lg shadow-sm">
            {summary?.bySeverity ? (
              <ReactECharts option={severityPieOption} style={{ height: 240 }} notMerge />
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>
        </Col>
      </Row>

      <Card className="!rounded-xl shadow-sm" title="筛选条件" extra={
        hasPermission('audit:export') && (
          <Button icon={<DownloadOutlined />} onClick={handleExport} loading={exporting}>
            导出 Excel
          </Button>
        )
      }>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <label className="block text-sm text-gray-600 mb-1">操作分类</label>
            <Select
              allowClear style={{ width: '100%' }} placeholder="全部分类"
              showSearch optionFilterProp="children"
              value={filters.category}
              onChange={(v) => setFilters((f: any) => ({ ...f, category: v }))}
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <Option key={k} value={k}>{v}</Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <label className="block text-sm text-gray-600 mb-1">严重级别</label>
            <Select
              allowClear style={{ width: '100%' }} placeholder="全部级别"
              value={filters.severity}
              onChange={(v) => setFilters((f: any) => ({ ...f, severity: v }))}
            >
              {Object.entries(SEVERITY_LABELS).map(([k, v]) => (
                <Option key={k} value={k}>{v}</Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <label className="block text-sm text-gray-600 mb-1">操作动作</label>
            <Input
              allowClear placeholder="如: LOGIN, CREATE..."
              value={filters.action}
              onChange={(e) => setFilters((f: any) => ({ ...f, action: e.target.value }))}
            />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <label className="block text-sm text-gray-600 mb-1">时间范围</label>
            <RangePicker showTime style={{ width: '100%' }}
              value={filters.dateRange}
              onChange={(v) => setFilters((f: any) => ({ ...f, dateRange: v }))} />
          </Col>
          <Col xs={24} md={6}>
            <label className="block text-sm text-gray-600 mb-1">关键词搜索</label>
            <Input
              allowClear placeholder="描述/资源ID/用户名..."
              prefix={<SearchOutlined className="text-gray-400" />}
              value={filters.keyword}
              onChange={(e) => setFilters((f: any) => ({ ...f, keyword: e.target.value }))}
              onPressEnter={handleSearch}
            />
          </Col>
          <Col xs={24} md={18} className="!-mt-3">
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查询</Button>
              <Button onClick={() => {
                setFilters({ category: undefined, severity: undefined, action: undefined, userId: undefined, dateRange: undefined, keyword: undefined });
                setPage(1); setTimeout(fetchData, 0); fetchSummary();
              }}>重置</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { fetchData(); fetchSummary(); }}>刷新</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card className="!rounded-xl shadow-sm">
        <Table
          rowKey="_id"
          loading={loading}
          columns={columns}
          dataSource={data}
          pagination={{
            current: page, pageSize, total, showSizeChanger: true,
            showQuickJumper: true, pageSizeOptions: ['20', '50', '100'],
            showTotal: (t) => `共 ${t} 条审计记录`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
          scroll={{ x: 1200, y: 600 }}
        />
      </Card>

      {/* 详情抽屉 */}
      <Drawer
        title={
          <Space>
            <FileSearchOutlined className="text-blue-500" />
            <span className="text-lg">审计日志详情</span>
            {detail && <Tag color={SEVERITY_COLORS[detail.severity]}>{SEVERITY_LABELS[detail.severity]}</Tag>}
          </Space>
        }
        open={detailOpen} onClose={() => setDetailOpen(false)}
        width={780} destroyOnClose
      >
        {detail ? (
          <div className="space-y-4">
            <Card size="small" className="!rounded-lg">
              <Descriptions column={2} size="small">
                <Descriptions.Item label="日志ID"><code className="text-xs">{detail._id}</code></Descriptions.Item>
                <Descriptions.Item label="记录时间">{dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
                <Descriptions.Item label="分类">
                  <Space>
                    {CATEGORY_ICONS[detail.category]}
                    <Tag color="geekblue">{CATEGORY_LABELS[detail.category] || detail.category}</Tag>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="操作"><code>{detail.action}</code></Descriptions.Item>
                <Descriptions.Item label="严重级别">
                  <Tag color={SEVERITY_COLORS[detail.severity]}>{SEVERITY_LABELS[detail.severity]}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="IP地址">{detail.ip ? <code>{detail.ip}</code> : '-'}</Descriptions.Item>
                <Descriptions.Item label="操作人" span={2}>
                  {detail.user ? (
                    <Space>
                      <UserOutlined />
                      <span className="font-medium">{detail.user.name}</span>
                      <span className="text-gray-500">({detail.user.username})</span>
                      <Tag color="purple">{detail.user.role}</Tag>
                    </Space>
                  ) : '系统'}
                </Descriptions.Item>
                <Descriptions.Item label="资源类型">{detail.resourceType || '-'}</Descriptions.Item>
                <Descriptions.Item label="资源ID">{detail.resourceId ? <code className="text-xs">{detail.resourceId}</code> : '-'}</Descriptions.Item>
                <Descriptions.Item label="浏览器" span={2}>
                  <span className="text-xs text-gray-600">{detail.userAgent || '-'}</span>
                </Descriptions.Item>
                <Descriptions.Item label="描述" span={2}>
                  <div className="bg-blue-50 px-3 py-2 rounded-lg text-sm">{detail.description}</div>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {detail.details && Object.keys(detail.details).length > 0 && (
              <Card size="small" title="附加详情" className="!rounded-lg">
                <pre className="bg-gray-50 p-3 rounded-lg overflow-auto text-xs leading-relaxed !m-0">
                  {JSON.stringify(detail.details, null, 2)}
                </pre>
              </Card>
            )}

            {(detail.beforeSnapshot || detail.afterSnapshot) && (
              <Card size="small" title="变更快照对比" className="!rounded-lg">
                <Row gutter={[16, 0]}>
                  <Col xs={24} md={12}>
                    <div className="text-xs text-gray-500 mb-1 font-semibold flex items-center gap-1">
                      <UnlockOutlined className="text-orange-500" />变更前 (Before)
                    </div>
                    <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 max-h-64 overflow-auto">
                      {detail.beforeSnapshot ? (
                        <pre className="text-xs leading-relaxed !m-0 text-orange-900">
                          {JSON.stringify(detail.beforeSnapshot, null, 2)}
                        </pre>
                      ) : <div className="text-xs text-gray-400 italic">无数据（新创建）</div>}
                    </div>
                  </Col>
                  <Col xs={24} md={12}>
                    <div className="text-xs text-gray-500 mb-1 font-semibold flex items-center gap-1">
                      <LockOutlined className="text-green-500" />变更后 (After)
                    </div>
                    <div className="bg-green-50 border border-green-100 rounded-lg p-3 max-h-64 overflow-auto">
                      {detail.afterSnapshot ? (
                        <pre className="text-xs leading-relaxed !m-0 text-green-900">
                          {JSON.stringify(detail.afterSnapshot, null, 2)}
                        </pre>
                      ) : <div className="text-xs text-gray-400 italic">无数据（已删除）</div>}
                    </div>
                  </Col>
                </Row>
              </Card>
            )}
          </div>
        ) : <Empty description="未找到日志详情" />}
      </Drawer>
    </div>
  );
};

export default AuditLogs;
