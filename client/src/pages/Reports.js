import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, Table, Button, DatePicker, Select, Space, Tag, Modal, Form,
  Drawer, Descriptions, Statistic, Row, Col, Progress, List, message,
  Spin, Empty, Tooltip, Divider, Alert, Input,
} from 'antd';
import {
  FileExcelOutlined, FilePdfOutlined, PlusOutlined, EyeOutlined,
  DownloadOutlined, ReloadOutlined, CalendarOutlined, BarChartOutlined,
  ThunderboltOutlined, ClockCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ExclamationCircleOutlined, FileSearchOutlined,
} from '@ant-design/icons';

import { api } from '../services/api';
import {
  RISK_COLORS, RISK_LABELS, formatPercent, formatNumber, formatCurrency,
  useUserStore,
} from '../store';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;



const Reports = () => {
  const hasPermission = useUserStore((s) => s.hasPermission);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState({ type: undefined, dateRange: undefined });
  const [generateOpen, setGenerateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [generateForm] = Form.useForm();
  const [todaySummary, setTodaySummary] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (filters.type) params.reportType = filters.type;
      if (filters.dateRange?.length === 2) {
        params.startDate = filters.dateRange[0].startOf('day').toISOString();
        params.endDate = filters.dateRange[1].endOf('day').toISOString();
      }
      const res = await api.reports.list(params);
      setData(res.reports || []);
      setTotal(res.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchToday = async () => {
    try {
      const res = await api.reports.summaryToday();
      setTodaySummary(res);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { fetchData(); }, [page, pageSize]);
  useEffect(() => { fetchToday(); }, []);

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };

  const handleGenerate = async (values) => {
    try {
      setLoading(true);
      const payload = {
        reportType: values.reportType,
      };
      if (values.range) {
        payload.startDate = values.range[0].startOf('day').toISOString();
        payload.endDate = values.range[1].endOf('day').toISOString();
      }
      const res = await api.reports.generate(payload);
      message.success('报告生成任务已提交，稍后将出现在列表中');
      setGenerateOpen(false);
      generateForm.resetFields();
      setTimeout(fetchData, 2000);
    } catch (e) {
      message.error(e.response?.data?.error || '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (id) => {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const res = await api.reports.get(id);
      setDetail(res);
    } catch (e) {
      message.error('加载报告详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const regenerateFiles = async (id) => {
    try {
      await api.reports.regenerateFiles(id);
      message.success('文件重新生成任务已提交');
      setTimeout(() => openDetail(id), 1500);
    } catch (e) {
      message.error(e.response?.data?.error || '操作失败');
    }
  };

  const handleDownload = (url, filename) => {
    const token = localStorage.getItem('token');
    const a = document.createElement('a');
    a.href = `${url}?token=${token}`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const riskPieOption = useMemo(() => {
    if (!detail?.riskDistribution) return {};
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0 },
      series: [{
        type: 'pie', radius: ['40%', '70%'], avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: true, formatter: '{b}\n{d}%' },
        data: detail.riskDistribution.map((r) => ({
          name: RISK_LABELS[r.level] || r.level,
          value: r.count,
          itemStyle: { color: RISK_COLORS[r.level] || '#999' },
        })),
      }],
    };
  }, [detail]);

  const sanctionBarOption = useMemo(() => {
    if (!detail?.sanctionHits) return {};
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 60, right: 20, top: 20, bottom: 60 },
      xAxis: {
        type: 'category',
        data: detail.sanctionHits.map((s) => s.listName),
        axisLabel: { rotate: 30, fontSize: 11 },
      },
      yAxis: { type: 'value' },
      series: [{
        type: 'bar', barWidth: '50%',
        itemStyle: { color: '#1677ff', borderRadius: [4, 4, 0, 0] },
        data: detail.sanctionHits.map((s) => s.count),
        label: { show: true, position: 'top' },
      }],
    };
  }, [detail]);

  const columns: Array = [
    {
      title: '报告类型', dataIndex: 'reportType', width: 120,
      render: (v) => <Tag color="blue">{v === 'DAILY' ? '日报' : v === 'WEEKLY' ? '周报' : v === 'MONTHLY' ? '月报' : '自定义'}</Tag>,
    },
    {
      title: '统计周期', dataIndex: ['period', 'label'], width: 220,
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <span className="font-semibold">{v}</span>
          <span className="text-xs text-gray-500">
            {dayjs(r.period?.start).format('MM-DD')} ~ {dayjs(r.period?.end).format('MM-DD')}
          </span>
        </Space>
      ),
    },
    {
      title: '交易总数', dataIndex: ['summary', 'totalTransactions'], width: 100, align: 'right',
      render: (v) => <span className="font-mono">{formatNumber(v)}</span>,
    },
    {
      title: '制裁命中', dataIndex: ['summary', 'flagged'], width: 100, align: 'right',
      sorter: (a, b) => (a.summary?.flagged || 0) - (b.summary?.flagged || 0),
      render: (v, r) => (
        <Space>
          <span className="font-mono text-red-600 font-semibold">{formatNumber(v)}</span>
          <Tag color="volcano" className="m-0">{formatPercent(r.summary?.hitRate)}</Tag>
        </Space>
      ),
    },
    {
      title: '通过/拒绝', width: 140, align: 'center',
      render: (_, r) => (
        <Space direction="vertical" size={0} className="text-xs">
          <Space><Tag color="green">{formatNumber(r.summary?.approved)} 通过</Tag></Space>
          <Space><Tag color="red">{formatNumber(r.summary?.rejected)} 拒绝</Tag></Space>
        </Space>
      ),
    },
    {
      title: '平均审查', dataIndex: ['summary', 'avgReviewHours'], width: 100, align: 'center',
      render: (v) => v ? (
        <Space>
          <ClockCircleOutlined className="text-blue-500" />
          <span className="font-mono">{Number(v).toFixed(1)}h</span>
        </Space>
      ) : '-',
    },
    {
      title: '生成时间', dataIndex: 'createdAt', width: 160,
      render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'),
      sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      defaultSortOrder: 'descend',
    },
    {
      title: '生成人', dataIndex: ['generatedBy', 'name'], width: 100,
      render: (v) => v || '系统自动',
    },
    {
      title: '操作', width: 220, fixed: 'right',
      render: (_, r) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r._id)}>详情</Button>
          </Tooltip>
          <Tooltip title={r.files?.excel ? '下载Excel' : '未生成'}>
            <Button
              type="link" size="small" icon={<FileExcelOutlined />}
              disabled={!r.files?.excel}
              onClick={() => handleDownload(api.reports.downloadExcel(r._id), `report_${r._id}.xlsx`)}
            >Excel</Button>
          </Tooltip>
          <Tooltip title={r.files?.pdf ? '下载PDF' : '未生成'}>
            <Button
              type="link" size="small" icon={<FilePdfOutlined />}
              disabled={!r.files?.pdf}
              onClick={() => handleDownload(api.reports.downloadPdf(r._id), `report_${r._id}.pdf`)}
            >PDF</Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* 今日摘要 */}
      {todaySummary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Card className="!rounded-xl shadow-sm border-l-4 border-blue-500">
              <Statistic
                title="今日交易"
                value={todaySummary.totalTransactions || 0}
                prefix={<BarChartOutlined className="text-blue-500" />}
                formatter={formatNumber}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="!rounded-xl shadow-sm border-l-4 border-red-500">
              <Statistic
                title="风险命中"
                value={todaySummary.flagged || 0}
                valueStyle={{ color: RISK_COLORS.CRITICAL }}
                prefix={<ThunderboltOutlined />}
                suffix={<span className="text-sm text-gray-500">({formatPercent(todaySummary.hitRate)})</span>}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="!rounded-xl shadow-sm border-l-4 border-green-500">
              <Statistic
                title="审查通过"
                value={todaySummary.approved || 0}
                valueStyle={{ color: RISK_COLORS.LOW }}
                prefix={<CheckCircleOutlined />}
                formatter={formatNumber}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="!rounded-xl shadow-sm border-l-4 border-orange-500">
              <Statistic
                title="平均审查时长"
                value={todaySummary.avgReviewHours || 0}
                precision={1}
                prefix={<ClockCircleOutlined className="text-orange-500" />}
                suffix="小时"
              />
            </Card>
          </Col>
        </Row>
      )}

      <Card className="!rounded-xl shadow-sm" title="筛选条件" extra={
        hasPermission('report:create') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setGenerateOpen(true)}>
            生成报告
          </Button>
        )
      }>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <label className="block text-sm text-gray-600 mb-1">报告类型</label>
            <Select
              allowClear style={{ width: '100%' }} placeholder="全部类型"
              value={filters.type}
              onChange={(v) => setFilters((f) => ({ ...f, type: v }))}
            >
              <Option value="DAILY">日报</Option>
              <Option value="WEEKLY">周报</Option>
              <Option value="MONTHLY">月报</Option>
              <Option value="CUSTOM">自定义</Option>
            </Select>
          </Col>
          <Col xs={24} sm={12} md={10}>
            <label className="block text-sm text-gray-600 mb-1">生成时间范围</label>
            <RangePicker style={{ width: '100%' }} value={filters.dateRange}
              onChange={(v) => setFilters((f) => ({ ...f, dateRange: v }))} />
          </Col>
          <Col xs={24} md={8}>
            <label className="block text-sm text-gray-600 mb-1">&nbsp;</label>
            <Space>
              <Button type="primary" icon={<FileSearchOutlined />} onClick={handleSearch}>查询</Button>
              <Button onClick={() => { setFilters({ type: undefined, dateRange: undefined }); setPage(1); setTimeout(fetchData, 0); }}>
                重置
              </Button>
              <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
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
            showQuickJumper: true, pageSizeOptions: ['10', '20', '50'],
            showTotal: (t) => `共 ${t} 条记录`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
          scroll={{ x: 1300 }}
        />
      </Card>

      {/* 生成报告模态框 */}
      <Modal
        title={<Space><PlusOutlined className="text-blue-500" />生成合规报告</Space>}
        open={generateOpen} onCancel={() => setGenerateOpen(false)}
        footer={null} destroyOnClose
      >
        <Form layout="vertical" form={generateForm} onFinish={handleGenerate}>
          <Form.Item name="reportType" label="报告类型" rules={[{ required: true, message: '请选择类型' }]}>
            <Select>
              <Option value="DAILY">日报（自然日）</Option>
              <Option value="WEEKLY">周报（周一至周日）</Option>
              <Option value="MONTHLY">月报（自然月）</Option>
              <Option value="CUSTOM">自定义周期</Option>
            </Select>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.reportType !== c.reportType}>
            {({ getFieldValue }) => getFieldValue('reportType') === 'CUSTOM' && (
              <Form.Item name="range" label="自定义日期范围" rules={[{ required: true, message: '请选择日期范围' }]}>
                <RangePicker style={{ width: '100%' }} />
              </Form.Item>
            )}
          </Form.Item>
          <Alert
            type="info" showIcon
            message="报告生成说明"
            description={
              <ul className="text-sm list-disc list-inside space-y-1 m-0">
                <li>系统将根据所选周期聚合统计所有合规数据</li>
                <li>生成过程包含 Excel 和 PDF 两份文件，约需 30-60 秒</li>
                <li>日报自动生成时间为每日凌晨 02:00</li>
              </ul>
            }
            className="mb-4"
          />
          <Form.Item className="!mb-0 text-right">
            <Space>
              <Button onClick={() => setGenerateOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit" loading={loading}>确认生成</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 报告详情抽屉 */}
      <Drawer
        title={
          <Space>
            <BarChartOutlined className="text-blue-500 text-xl" />
            <span className="text-lg">合规报告详情</span>
            {detail && <Tag color="blue">{detail.reportType}</Tag>}
          </Space>
        }
        open={detailOpen} onClose={() => setDetailOpen(false)}
        width={880} destroyOnClose
      >
        <Spin spinning={detailLoading}>
          {detail ? (
            <div className="space-y-5">
              {/* 基础信息 */}
              <Card size="small" className="!rounded-lg">
                <Descriptions column={2} size="small">
                  <Descriptions.Item label="报告ID"><code className="text-xs">{detail._id}</code></Descriptions.Item>
                  <Descriptions.Item label="统计周期">{detail.period?.label}</Descriptions.Item>
                  <Descriptions.Item label="周期范围">
                    {dayjs(detail.period?.start).format('YYYY-MM-DD')} ~ {dayjs(detail.period?.end).format('YYYY-MM-DD')}
                  </Descriptions.Item>
                  <Descriptions.Item label="生成时间">{dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
                  <Descriptions.Item label="生成人">{detail.generatedBy?.name || '系统自动'}</Descriptions.Item>
                  <Descriptions.Item label="文件状态">
                    <Space>
                      {detail.files?.excel ? <Tag color="green">Excel ✓</Tag> : <Tag>未生成</Tag>}
                      {detail.files?.pdf ? <Tag color="green">PDF ✓</Tag> : <Tag>未生成</Tag>}
                    </Space>
                  </Descriptions.Item>
                </Descriptions>
              </Card>

              {/* 汇总指标 */}
              <Card size="small" title="汇总统计" className="!rounded-lg">
                <Row gutter={[12, 12]}>
                  <Col xs={12} sm={8}>
                    <div className="p-3 rounded-lg bg-blue-50 text-center">
                      <div className="text-xs text-blue-600">交易总数</div>
                      <div className="text-xl font-bold font-mono text-blue-700">{formatNumber(detail.summary?.totalTransactions)}</div>
                    </div>
                  </Col>
                  <Col xs={12} sm={8}>
                    <div className="p-3 rounded-lg bg-purple-50 text-center">
                      <div className="text-xs text-purple-600">已筛查</div>
                      <div className="text-xl font-bold font-mono text-purple-700">{formatNumber(detail.summary?.screened)}</div>
                    </div>
                  </Col>
                  <Col xs={12} sm={8}>
                    <div className="p-3 rounded-lg bg-red-50 text-center">
                      <div className="text-xs text-red-600">风险命中</div>
                      <div className="text-xl font-bold font-mono text-red-700">{formatNumber(detail.summary?.flagged)}</div>
                      <Progress percent={Number(detail.summary?.hitRate || 0).toFixed(1)} size="small"
                        strokeColor="#ff4d4f" showInfo={false} className="!mt-1" />
                    </div>
                  </Col>
                  <Col xs={12} sm={8}>
                    <div className="p-3 rounded-lg bg-green-50 text-center">
                      <div className="text-xs text-green-600">审查通过</div>
                      <div className="text-xl font-bold font-mono text-green-700">{formatNumber(detail.summary?.approved)}</div>
                    </div>
                  </Col>
                  <Col xs={12} sm={8}>
                    <div className="p-3 rounded-lg bg-rose-50 text-center">
                      <div className="text-xs text-rose-600">审查拒绝</div>
                      <div className="text-xl font-bold font-mono text-rose-700">{formatNumber(detail.summary?.rejected)}</div>
                    </div>
                  </Col>
                  <Col xs={12} sm={8}>
                    <div className="p-3 rounded-lg bg-amber-50 text-center">
                      <div className="text-xs text-amber-600">SLA超时</div>
                      <div className="text-xl font-bold font-mono text-amber-700">{formatNumber(detail.summary?.slaBreachCount)}</div>
                    </div>
                  </Col>
                </Row>
                <Divider className="!my-4" />
                <Row gutter={[12, 0]}>
                  <Col xs={24} sm={12}>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">制裁命中率</span>
                      <span className="font-bold font-mono">{formatPercent(detail.summary?.hitRate)}</span>
                    </div>
                    <Progress percent={Number(detail.summary?.hitRate || 0).toFixed(1)} strokeColor="#fa8c16" />
                  </Col>
                  <Col xs={24} sm={12}>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">平均审查时长</span>
                      <span className="font-bold font-mono">{Number(detail.summary?.avgReviewHours || 0).toFixed(2)} 小时</span>
                    </div>
                    <Progress percent={Math.min(Number(detail.summary?.avgReviewHours || 0) / 24 * 100, 100).toFixed(1)} strokeColor="#1677ff" />
                  </Col>
                </Row>
              </Card>

              {/* 风险分布 */}
              <Row gutter={[16, 0]}>
                <Col xs={24} md={12}>
                  <Card size="small" title="风险等级分布" className="!rounded-lg h-full">
                    {detail.riskDistribution?.length ? (
                      <ReactECharts option={riskPieOption} style={{ height: 280 }} notMerge />
                    ) : <Empty description="暂无数据" />}
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card size="small" title="制裁名单命中分布" className="!rounded-lg h-full">
                    {detail.sanctionHits?.length ? (
                      <ReactECharts option={sanctionBarOption} style={{ height: 280 }} notMerge />
                    ) : <Empty description="暂无数据" />}
                  </Card>
                </Col>
              </Row>

              {/* 详细列表 */}
              <Card size="small" title="风险等级明细" className="!rounded-lg">
                <List
                  size="small"
                  dataSource={detail.riskDistribution || []}
                  renderItem={(item) => (
                    <List.Item className="!px-0">
                      <Row className="w-full" align="middle" gutter={[8, 0]}>
                        <Col span={6}>
                          <Tag color={RISK_COLORS[item.level]}>{RISK_LABELS[item.level] || item.level}</Tag>
                        </Col>
                        <Col span={6} className="text-right font-mono">{formatNumber(item.count)} 笔</Col>
                        <Col span={12}>
                          <Progress percent={Number(item.percentage || 0).toFixed(1)} size="small"
                            strokeColor={RISK_COLORS[item.level]} />
                        </Col>
                      </Row>
                    </List.Item>
                  )}
                />
              </Card>

              <Card size="small" title="操作区" className="!rounded-lg">
                <Space wrap>
                  {hasPermission('report:export') && (
                    <>
                      <Button icon={<FileExcelOutlined />} disabled={!detail.files?.excel}
                        onClick={() => handleDownload(api.reports.downloadExcel(detail._id), `report_${detail._id}.xlsx`)}>
                        下载 Excel
                      </Button>
                      <Button icon={<FilePdfOutlined />} disabled={!detail.files?.pdf}
                        onClick={() => handleDownload(api.reports.downloadPdf(detail._id), `report_${detail._id}.pdf`)}>
                        下载 PDF
                      </Button>
                    </>
                  )}
                  {hasPermission('report:create') && (
                    <Button icon={<ReloadOutlined />} onClick={() => regenerateFiles(detail._id)}>
                      重新生成文件
                    </Button>
                  )}
                </Space>
              </Card>
            </div>
          ) : (
            !detailLoading && <Empty description="报告不存在" />
          )}
        </Spin>
      </Drawer>
    </div>
  );
};

export default Reports;
