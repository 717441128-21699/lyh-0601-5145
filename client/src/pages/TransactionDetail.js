import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Spin, message, Result, Descriptions, Row, Col, Tag, Progress, Divider, List, Space, Tooltip, Timeline } from 'antd';
import { ArrowLeftOutlined, EditOutlined, FileSearchOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, ThunderboltOutlined, SafetyOutlined, TeamOutlined, DatabaseOutlined, ExclamationCircleOutlined, ReloadOutlined, FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons';
import { api } from '../services/api';
import { RISK_COLORS, RISK_LABELS, TRANSACTION_STATUS_LABELS, TRANSACTION_STATUS_COLORS, formatCurrency, formatNumber, formatPercent, useUserStore } from '../store';
import dayjs from 'dayjs';

const TransactionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const hasPermission = useUserStore((s) => s.hasPermission);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [notFound, setNotFound] = useState(false);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, h] = await Promise.all([api.transactions.get(id), api.transactions.history(id)]);
      setDetail(d);
      setHistory(h.logs || []);
    } catch (e: any) {
      if (e.response?.status === 404) {
        setNotFound(true);
      } else {
        message.error('加载交易详情失败');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  if (notFound) {
    return (
      <Card>
        <Result status="404" title="交易不存在" subTitle={`未找到交易编号 ${id}，可能已被删除或编号错误`}
          extra={<Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/transactions')}>返回交易列表</Button>}
        />
      </Card>
    );
  }

  const riskScore = detail?.riskScore || 0;
  const riskLevel = detail?.riskLevel || 'SAFE';

  return (
    <div className="space-y-4">
      <Card size="small" className="!rounded-lg shadow-sm border-l-4"
        style={{ borderLeftColor: RISK_COLORS[riskLevel] || '#1677ff' }}>
        <Row align="middle" gutter={[16, 8]}>
          <Col flex="auto">
            <Space direction="vertical" size={2}>
              <Space>
                <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/transactions')}>
                  返回列表
                </Button>
                <h2 className="!m-0 text-lg font-bold">
                  <DatabaseOutlined className="text-blue-500 mr-1" />
                  交易详情
                  <Tag color="blue" className="ml-2 font-mono">{detail?.transactionId || '-'}</Tag>
                </h2>
              </Space>
              <div className="text-xs text-gray-500">
                PO号: {detail?.poNumber || '-'} &nbsp;·&nbsp; 创建于 {dayjs(detail?.createdAt).format('YYYY-MM-DD HH:mm:ss')}
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Tag color={TRANSACTION_STATUS_COLORS[detail?.status]}>{TRANSACTION_STATUS_LABELS[detail?.status]}</Tag>
              {hasPermission('transaction:update') && detail?.status !== 'REJECTED' && (
                <Button size="small" icon={detail?.status === 'FROZEN' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                  onClick={async () => {
                    try {
                      if (detail?.status === 'FROZEN') {
                        await api.transactions.release(id, '手动放行');
                        message.success('已放行');
                      } else {
                        await api.transactions.freeze(id, '手动冻结');
                        message.success('已冻结');
                      }
                      fetchData();
                    } catch (e) { /* ignore */ }
                  }}
                >
                  {detail?.status === 'FROZEN' ? '放行交易' : '冻结交易'}
                </Button>
              )}
              {hasPermission('transaction:screen') && (
                <Button size="small" icon={<ReloadOutlined />} onClick={async () => {
                  try { await api.transactions.rescreen(id); message.success('重筛查任务已提交'); setTimeout(fetchData, 2000); }
                  catch (e) { /* ignore */ }
                }}>重新筛查</Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      <Spin spinning={loading}>
        {detail && (
          <>
            {/* 风险评分 */}
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Card className="!rounded-xl shadow-sm text-center h-full" size="small">
                  <div className="mb-2">
                    <span className="text-sm text-gray-500">风险评分</span>
                  </div>
                  <Progress
                    type="dashboard"
                    percent={Math.min(riskScore, 100)}
                    strokeColor={RISK_COLORS[riskLevel]}
                    size={140}
                    format={(p) => <span className="text-2xl font-bold" style={{ color: RISK_COLORS[riskLevel] }}>{p}</span>}
                  />
                  <Tag color={RISK_COLORS[riskLevel]} className="!text-base !px-4 !py-1 mt-2">
                    <SafetyOutlined /> {RISK_LABELS[riskLevel]}
                  </Tag>
                </Card>
              </Col>
              <Col xs={24} md={16}>
                <Card className="!rounded-xl shadow-sm h-full" size="small" title={<Space><ThunderboltOutlined className="text-orange-500" />风险因子分析</Space>}>
                  <div className="space-y-2">
                    {detail?.riskFactors?.length ? detail.riskFactors.map((f: any, i: number) => (
                      <Row key={i} align="middle" className="py-1.5 border-b border-gray-100 last:border-0">
                        <Col span={10} className="text-sm font-medium">{f.name}</Col>
                        <Col span={6} className="text-center">
                          <Tag color={f.weight >= 50 ? 'red' : f.weight >= 25 ? 'orange' : 'blue'}>
                            权重 {f.weight}
                          </Tag>
                        </Col>
                        <Col span={8}>
                          <Progress percent={Math.min(f.score || 0, 100)} size="small"
                            strokeColor={f.weight >= 50 ? '#ff4d4f' : f.weight >= 25 ? '#fa8c16' : '#1677ff'} showInfo={false} />
                        </Col>
                      </Row>
                    )) : <div className="text-gray-400 text-sm py-4 text-center">暂无风险因子</div>}
                  </div>
                </Card>
              </Col>
            </Row>

            {/* 基本信息 */}
            <Card title={<Space><FileSearchOutlined />基本信息</Space>} className="!rounded-xl shadow-sm" size="small">
              <Descriptions column={2} size="small" bordered>
                <Descriptions.Item label="交易ID"><code className="text-xs">{detail._id}</code></Descriptions.Item>
                <Descriptions.Item label="交易编号"><span className="font-mono font-semibold">{detail.transactionId}</span></Descriptions.Item>
                <Descriptions.Item label="PO号">{detail.poNumber || '-'}</Descriptions.Item>
                <Descriptions.Item label="订单日期">{detail.orderDate ? dayjs(detail.orderDate).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
                <Descriptions.Item label="交易金额" span={2}>
                  <span className="text-lg font-bold">{formatCurrency(detail.amount, detail.currency)}</span>
                </Descriptions.Item>
                <Descriptions.Item label="供应商">
                  <Space>
                    <TeamOutlined className="text-purple-500" />
                    <span className="font-medium">{detail.supplier?.name || '-'}</span>
                    {detail.supplier?.riskLevel && <Tag color={RISK_COLORS[detail.supplier.riskLevel]}>{RISK_LABELS[detail.supplier.riskLevel]}</Tag>}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="供应商编号"><code className="text-xs">{detail.supplier?.code || '-'}</code></Descriptions.Item>
              </Descriptions>
            </Card>

            {/* 商品信息 */}
            <Card title={<Space><DatabaseOutlined />商品与贸易信息</Space>} className="!rounded-xl shadow-sm" size="small">
              <Descriptions column={2} size="small" bordered>
                <Descriptions.Item label="商品描述">{detail.productDescription || '-'}</Descriptions.Item>
                <Descriptions.Item label="HS编码">
                  <Space>
                    <Tag color="geekblue" className="font-mono">{detail.hsCode || '-'}</Tag>
                    {detail.hsCodeSanctioned && <Tag color="red">管制编码</Tag>}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="原产国">
                  <Tag color={detail.countryRisk === 'HIGH' ? 'red' : detail.countryRisk === 'MEDIUM' ? 'orange' : 'green'}>
                    {detail.originCountry || '-'}
                    {detail.countryRisk && ` (${detail.countryRisk})`}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="目的国/最终用户">
                  <Space>
                    <span>{detail.destinationCountry || '-'}</span>
                    {detail.endUser && <Tag color="purple">{detail.endUser}</Tag>}
                    {detail.endUserSensitive && <Tag color="red">敏感用途</Tag>}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="贸易方式">{detail.tradeType || '-'}</Descriptions.Item>
                <Descriptions.Item label="运输方式">{detail.shippingMethod || '-'}</Descriptions.Item>
              </Descriptions>
            </Card>

            {/* 制裁命中 */}
            <Card
              title={<Space><SafetyOutlined className="text-red-500" />制裁名单匹配结果 ({detail.sanctionMatches?.length || 0})</Space>}
              className="!rounded-xl shadow-sm" size="small"
              extra={detail.sanctionMatches?.length > 0 && <Tag color="red">{detail.sanctionMatches.length} 条命中</Tag>}
            >
              {detail.sanctionMatches?.length ? (
                <List
                  dataSource={detail.sanctionMatches}
                  renderItem={(m: any) => (
                    <List.Item className="!px-0">
                      <Card size="small" className="w-full !rounded-lg border-l-4 !border-l-red-500">
                        <Row gutter={[12, 8]} align="middle">
                          <Col xs={24} md={8}>
                            <Space direction="vertical" size={1}>
                              <Tag color="volcano">{m.listName}</Tag>
                              <div className="font-medium">{m.matchedName}</div>
                            </Space>
                          </Col>
                          <Col xs={24} md={6}>
                            <div className="text-xs text-gray-500">匹配类型</div>
                            <Tag color="blue">{m.matchType}</Tag>
                          </Col>
                          <Col xs={24} md={5}>
                            <div className="text-xs text-gray-500">相似度</div>
                            <Progress percent={Math.round((m.similarity || 0) * 100)} size="small"
                              strokeColor={(m.similarity || 0) >= 0.95 ? '#ff4d4f' : (m.similarity || 0) >= 0.85 ? '#fa8c16' : '#1677ff'} />
                          </Col>
                          <Col xs={24} md={5}>
                            <div className="text-xs text-gray-500">匹配字段</div>
                            <span className="text-sm">{m.matchedField}</span>
                          </Col>
                        </Row>
                      </Card>
                    </List.Item>
                  )}
                />
              ) : <div className="text-gray-400 text-sm py-6 text-center"><CheckCircleOutlined className="text-green-500 mr-1" />未命中任何制裁名单</div>}
            </Card>

            {/* 审查工单 */}
            {detail.reviewTicket && (
              <Card title={<Space><FileSearchOutlined className="text-purple-500" />关联审查工单</Space>} className="!rounded-xl shadow-sm" size="small">
                <Row gutter={[16, 8]} align="middle">
                  <Col xs={24} md={6}>
                    <div className="text-xs text-gray-500">工单号</div>
                    <div className="font-mono font-semibold cursor-pointer hover:text-blue-600"
                      onClick={() => navigate(`/reviews/${detail.reviewTicket._id}`)}>
                      <FileSearchOutlined className="text-purple-500" /> {detail.reviewTicket.ticketId}
                    </div>
                  </Col>
                  <Col xs={24} md={4}>
                    <div className="text-xs text-gray-500">状态</div>
                    <Tag color={detail.reviewTicket.status === 'APPROVED' ? 'green' : detail.reviewTicket.status === 'REJECTED' ? 'red' : 'blue'}>
                      {detail.reviewTicket.status}
                    </Tag>
                  </Col>
                  <Col xs={24} md={6}>
                    <div className="text-xs text-gray-500">分配给</div>
                    <Space><TeamOutlined className="text-purple-500" /><span>{detail.reviewTicket.assignedTo?.name || '-'}</span></Space>
                  </Col>
                  <Col xs={24} md={8}>
                    <div className="text-xs text-gray-500">审查时限</div>
                    <Space>
                      <ClockCircleOutlined className={dayjs(detail.reviewTicket.reviewDeadline).isBefore(dayjs()) ? 'text-red-500' : 'text-orange-500'} />
                      <span className={dayjs(detail.reviewTicket.reviewDeadline).isBefore(dayjs()) ? 'text-red-500 font-bold' : ''}>
                        {dayjs(detail.reviewTicket.reviewDeadline).format('YYYY-MM-DD HH:mm')}
                      </span>
                      {dayjs(detail.reviewTicket.reviewDeadline).isBefore(dayjs()) && <Tag color="red">已超时</Tag>}
                    </Space>
                  </Col>
                </Row>
              </Card>
            )}

            {/* 操作历史 */}
            <Card title={<Space><ClockCircleOutlined className="text-blue-500" />操作历史时间线</Space>} className="!rounded-xl shadow-sm" size="small">
              {history.length ? (
                <Timeline
                  mode="left"
                  items={history.map((h: any) => ({
                    color: h.severity === 'ERROR' ? 'red' : h.severity === 'WARNING' ? 'orange' : h.severity === 'CRITICAL' ? '#8b0000' : 'blue',
                    label: <span className="text-xs text-gray-500 font-mono whitespace-nowrap">{dayjs(h.createdAt).format('YYYY-MM-DD HH:mm:ss')}</span>,
                    children: (
                      <div className="pb-2">
                        <div className="font-medium text-sm flex items-center gap-2">
                          <Tag color="geekblue" className="!text-xs !m-0">{h.action}</Tag>
                          {h.user?.name && <span className="text-xs text-gray-500">by {h.user.name}</span>}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">{h.description}</div>
                        {h.notes && <div className="text-xs text-gray-500 mt-1 bg-gray-50 p-2 rounded">📝 {h.notes}</div>}
                      </div>
                    ),
                  }))}
                />
              ) : <div className="text-gray-400 text-sm text-center py-6">暂无操作记录</div>}
            </Card>
          </>
        )}
      </Spin>
    </div>
  );
};

export default TransactionDetail;
