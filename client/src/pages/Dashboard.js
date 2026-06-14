import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Progress, Table, Tag, Spin, App, Typography, Empty, Space, Tooltip, Divider, Button } from 'antd';
import {
  ShoppingCartOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  RiseOutlined,
  BarChartOutlined,
  FileDoneOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { api } from '../services/api';
import { RISK_COLORS, RISK_LABELS, formatPercent, formatNumber } from '../store';
import { useNavigate } from 'react-router-dom';

const { Text, Title } = Typography;

export default function Dashboard() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});
  const [trend, setTrend] = useState([]);
  const [hourly, setHourly] = useState([]);
  const [topRisk, setTopRisk] = useState([]);
  const [riskBreakdown, setRiskBreakdown] = useState([]);
  const [sancBreakdown, setSancBreakdown] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [topSuppliers, setTopSuppliers] = useState([]);
  const [reviewStats, setReviewStats] = useState({});

  const loadAll = async () => {
    setLoading(true);
    try {
      const [realtime, trend7, hour, preview] = await Promise.all([
        api.dashboard.realtime(),
        api.dashboard.trend('7d'),
        api.dashboard.hourlyToday(),
        api.dashboard.reportPreview('7d'),
      ]);
      setData(realtime);
      setTrend(trend7.data || []);
      setHourly(hour || []);
      setRiskBreakdown(preview.riskDistribution || []);
      setSancBreakdown(preview.sanctionListBreakdown || []);
      setTopRisk(preview.countryRiskBreakdown || []);
      setAlerts(realtime.recentAlerts || []);
      setTopSuppliers(realtime.topSuppliersByRisk || []);

      try {
        const rs = await api.reviews.dashboard();
        setReviewStats(rs);
      } catch { /* ignore */ }
    } catch (err) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const trendOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['交易数', '命中数', '高风险数', '平均风险分'], top: 0 },
    grid: { left: 40, right: 50, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: trend.map(d => d._id.datePart?.slice(5) || d._id?.datePart || '') },
    yAxis: [
      { type: 'value', name: '数量' },
      { type: 'value', name: '风险分', max: 100 },
    ],
    series: [
      { name: '交易数', type: 'bar', data: trend.map(d => d.total), itemStyle: { color: '#1677ff' } },
      { name: '命中数', type: 'bar', stack: 'a', data: trend.map(d => d.hits), itemStyle: { color: '#fa8c16' } },
      { name: '高风险数', type: 'line', data: trend.map(d => d.highRisk), itemStyle: { color: '#ff4d4f' } },
      { name: '平均风险分', type: 'line', yAxisIndex: 1, data: trend.map(d => (d.avgRisk || 0).toFixed(1)), itemStyle: { color: '#722ed1' }, smooth: true },
    ],
  };

  const hourlyOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 40, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: hourly.map(h => h.label) },
    yAxis: [{ type: 'value' }, { type: 'value', max: 100 }],
    series: [
      { name: '交易量', type: 'bar', data: hourly.map(h => h.count), itemStyle: { color: '#1677ff', opacity: 0.85 } },
      { name: '命中数', type: 'bar', stack: 'total', data: hourly.map(h => h.hits), itemStyle: { color: '#fa8c16' } },
      { name: '风险分', type: 'line', yAxisIndex: 1, smooth: true, data: hourly.map(h => h.avgRisk), itemStyle: { color: '#ff4d4f' }, areaStyle: { opacity: 0.1 } },
    ],
  };

  const pieOption = {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie', radius: ['45%', '70%'], center: ['50%', '45%'],
      label: { show: true, formatter: '{b}: {d}%' },
      data: riskBreakdown.map(r => ({
        name: RISK_LABELS[r.level] || r.level,
        value: r.count,
        itemStyle: { color: RISK_COLORS[r.level] || '#999' },
      })).filter(r => r.value > 0),
    }],
  };

  const sanctionOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 120, right: 20, top: 10, bottom: 30 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: sancBreakdown.map(s => s.listName).reverse() },
    series: [
      {
        name: '命中次数',
        type: 'bar',
        data: sancBreakdown.map(s => s.hitCount).reverse(),
        itemStyle: { color: '#722ed1', borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right' },
      },
    ],
  };

  const statCards = [
    {
      title: '今日交易', value: formatNumber(data.today?.transactions),
      icon: <ShoppingCartOutlined style={{ color: '#1677ff' }} />, color: '#e6f4ff',
      suffix: '笔', sub: `命中 ${formatNumber(data.today?.sanctionHits)} 次 · 命中率 ${formatPercent(data.today?.hitRate)}`,
      onClick: () => navigate('/transactions'),
    },
    {
      title: '本周交易', value: formatNumber(data.week?.transactions),
      icon: <RiseOutlined style={{ color: '#13c2c2' }} />, color: '#e6fffb',
      suffix: '笔', sub: '近7天累计',
    },
    {
      title: '制裁命中', value: formatNumber(data.today?.sanctionHits),
      icon: <WarningOutlined style={{ color: '#fa8c16' }} />, color: '#fff7e6',
      suffix: '次', sub: `高风险告警 ${formatNumber(data.today?.highRiskAlerts)} 项`,
      onClick: () => navigate('/reviews?priority=URGENT'),
    },
    {
      title: '待处理工单', value: formatNumber(data.pending?.reviews),
      icon: <ClockCircleOutlined style={{ color: '#722ed1' }} />, color: '#f9f0ff',
      suffix: '张', sub: (data.pending?.overdue || 0) > 0 ? (
        <span style={{ color: '#ff4d4f', fontWeight: 600 }}>⚠️ 超时 {data.pending.overdue} 张</span>
      ) : '暂无超时',
      onClick: () => navigate('/reviews'),
    },
    {
      title: '制裁条目', value: formatNumber(data.inventory?.sanctionEntries),
      icon: <SafetyCertificateOutlined style={{ color: '#eb2f96' }} />, color: '#fff0f6',
      suffix: '条', sub: '7大权威名单',
      onClick: () => navigate('/sanctions'),
    },
    {
      title: '供应商', value: formatNumber(data.suppliers?.total),
      icon: <TeamOutlined style={{ color: '#52c41a' }} />, color: '#f6ffed',
      suffix: '家', sub: `高风险 ${formatNumber(data.suppliers?.highRisk)} 家`,
      onClick: () => navigate('/suppliers?riskLevel=HIGH'),
    },
  ];

  const alertCols = [
    {
      title: '工单', dataIndex: 'ticketId', key: 'ticketId', width: 130,
      render: (v) => <a onClick={() => navigate(`/reviews/${v}`)} style={{ fontFamily: 'monospace' }}>{v}</a>,
    },
    { title: '关联交易', dataIndex: 'transactionRefId', width: 180, render: v => <Text code>{v}</Text> },
    {
      title: '风险等级', dataIndex: 'riskLevel', width: 100,
      render: v => <Tag color={RISK_COLORS[v]} style={{ fontWeight: 600 }}>{RISK_LABELS[v] || v}</Tag>,
    },
    {
      title: '优先级', dataIndex: 'priority', width: 90,
      render: v => {
        const colors = { URGENT: 'red', HIGH: 'orange', MEDIUM: 'blue', LOW: 'green' };
        return <Tag color={colors[v]}>{v}</Tag>;
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: v => {
        const map = { PENDING: 'default', ASSIGNED: 'blue', IN_PROGRESS: 'processing', APPROVED: 'success', REJECTED: 'error', ESCALATED: 'warning' };
        return <Tag color={map[v]}>{v}</Tag>;
      },
    },
    { title: '命中', dataIndex: 'sanctionMatches', width: 80, render: v => (Array.isArray(v) ? v.length : 0) },
    { title: '创建时间', dataIndex: 'createdAt', render: v => dayjs(v).format('MM-DD HH:mm') },
  ];

  const topSupplierCols = [
    {
      title: '供应商', dataIndex: 'name',
      render: (v, r) => <a onClick={() => navigate(`/suppliers/${r.supplierId}`)}>{v}</a>,
    },
    { title: '国别', dataIndex: 'country', width: 90 },
    {
      title: '风险等级', dataIndex: 'riskLevel', width: 100,
      render: v => <Tag color={RISK_COLORS[v]}>{RISK_LABELS[v] || v}</Tag>,
    },
    {
      title: '风险分', dataIndex: 'riskScore', width: 160,
      render: v => <Progress percent={v} size="small" strokeColor={v >= 80 ? '#ff4d4f' : v >= 50 ? '#fa8c16' : '#1677ff'} />,
    },
    { title: '拒单数', dataIndex: 'rejectionCount', width: 80 },
  ];

  const topCountryCols = [
    { title: '国家', dataIndex: 'country', width: 100 },
    { title: '交易数', dataIndex: 'transactionCount', render: v => formatNumber(v) },
    { title: '命中数', dataIndex: 'hitCount', render: v => <Text type={v > 0 ? 'danger' : ''}>{formatNumber(v)}</Text> },
    {
      title: '高风险', dataIndex: 'highRiskCount',
      render: v => v > 0 ? <Tag color="red">{v}</Tag> : '0',
    },
  ];

  if (loading) {
    return (
      <div style={{ padding: 100, textAlign: 'center' }}>
        <Spin size="large" tip="正在加载仪表盘数据..." />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>📊 监控总览</Title>
          <Text type="secondary">实时数据更新 · {dayjs().format('YYYY年MM月DD日 HH:mm')}</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadAll}>刷新</Button>
          <Button type="primary" icon={<FileDoneOutlined />} onClick={() => navigate('/reports')}>查看报告</Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {statCards.map((card, idx) => (
          <Col xs={24} sm={12} md={8} lg={4} key={idx}>
            <Card
              hoverable
              onClick={card.onClick}
              style={{ borderRadius: 10, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
              bodyStyle={{ padding: '16px 18px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{card.title}</Text>
                  <div style={{ marginTop: 6 }}>
                    <span style={{ fontSize: 22, fontWeight: 700 }}>{card.value}</span>
                    <span style={{ fontSize: 13, color: '#999', marginLeft: 4 }}>{card.suffix}</span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: '#888', minHeight: 16 }}>{card.sub}</div>
                </div>
                <div
                  style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: card.color, fontSize: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {card.icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16}>
          <Card
            title="近7天交易趋势"
            extra={<Text type="secondary">共 {formatNumber(trend.reduce((s, d) => s + (d.total || 0), 0))} 笔</Text>}
            style={{ borderRadius: 10, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          >
            <ReactECharts option={trendOption} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            title="风险等级分布"
            extra={<Tag color="blue">近7天</Tag>}
            style={{ borderRadius: 10, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          >
            {riskBreakdown.length > 0 && riskBreakdown.some(r => r.count > 0)
              ? <ReactECharts option={pieOption} style={{ height: 300 }} />
              : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
            }
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <Card
            title="今日交易量（小时）"
            style={{ borderRadius: 10, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          >
            <ReactECharts option={hourlyOption} style={{ height: 280 }} />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            title="制裁名单命中 TOP"
            style={{ borderRadius: 10, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          >
            {sancBreakdown.length > 0
              ? <ReactECharts option={sanctionOption} style={{ height: 280 }} />
              : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
            }
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <Card
            title={<Space><ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />近期告警工单</Space>}
            extra={<a onClick={() => navigate('/reviews')}>查看全部 →</a>}
            style={{ borderRadius: 10, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          >
            <Table
              columns={alertCols}
              dataSource={alerts}
              rowKey="ticketId"
              size="small"
              pagination={false}
              locale={{ emptyText: <Empty description="暂无告警" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            title={<Space><TeamOutlined style={{ color: '#fa8c16' }} />高风险供应商</Space>}
            extra={<a onClick={() => navigate('/suppliers?riskLevel=HIGH')}>全部 →</a>}
            style={{ borderRadius: 10, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          >
            <Table
              columns={topSupplierCols}
              dataSource={topSuppliers}
              rowKey="supplierId"
              size="small"
              pagination={false}
              locale={{ emptyText: <Empty description="暂无高风险供应商" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={<Space><BarChartOutlined />高风险国家分布 (近7天)</Space>}
        style={{ borderRadius: 10, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
      >
        <Table
          columns={topCountryCols}
          dataSource={topRisk}
          rowKey="country"
          size="small"
          pagination={false}
          scroll={{ x: 600 }}
        />
      </Card>
    </div>
  );
}
