import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Spin, message, Result, Descriptions, Row, Col, Tag, Progress, Divider, List, Space, Tooltip, Timeline, Modal, Form, Input, Select, Avatar, Statistic, Alert, Progress as AntProgress, Empty, Badge } from 'antd';
import { ArrowLeftOutlined, UserOutlined, TeamOutlined, FileSearchOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, ThunderboltOutlined, SafetyOutlined, SendOutlined, ExclamationCircleOutlined, ReloadOutlined, WarningOutlined, DatabaseOutlined, RiseOutlined, UnlockOutlined, LockOutlined } from '@ant-design/icons';
import { api } from '../services/api';
import { RISK_COLORS, RISK_LABELS, TRANSACTION_STATUS_LABELS, TRANSACTION_STATUS_COLORS, formatCurrency, formatNumber, formatPercent, useUserStore, COUNTRIES } from '../store';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';

const { Option } = Select;
const { TextArea } = Input;

const SupplierDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const hasPermission = useUserStore((s) => s.hasPermission);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [unblockOpen, setUnblockOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [blacklistForm] = Form.useForm();
  const [unblockForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [transTab, setTransTab] = useState('recent');
  const [recentTrans, setRecentTrans] = useState<any[]>([]);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, h, t] = await Promise.all([
        api.suppliers.get(id),
        api.suppliers.history(id).catch(() => ({ logs: [] })),
        api.transactions.list({ supplierId: id, pageSize: 10, page: 1 }).catch(() => ({ transactions: [] })),
      ]);
      setDetail(d);
      setHistory((h as any).logs || []);
      setRecentTrans((t as any).transactions || []);
    } catch (e: any) {
      if (e.response?.status === 404) setNotFound(true);
      else message.error('加载供应商详情失败');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [id]);

  const doBlacklist = async (values: any) => {
    try {
      setActionLoading(true);
      const payload: any = {
        reason: values.reason,
        notes: values.notes,
        rejectPending: values.rejectPending !== false,
      };
      await api.suppliers.blacklist(id, payload);
      message.success('已加入黑名单');
      setBlacklistOpen(false); blacklistForm.resetFields();
      setTimeout(fetchData, 800);
    } catch (e: any) { message.error(e.response?.data?.error || '操作失败'); }
    finally { setActionLoading(false); }
  };

  const doUnblock = async (values: any) => {
    try {
      setActionLoading(true);
      await api.suppliers.unblock(id, values.reason);
      message.success('已解除黑名单');
      setUnblockOpen(false); unblockForm.resetFields();
      setTimeout(fetchData, 800);
    } catch (e: any) { message.error(e.response?.data?.error || '操作失败'); }
    finally { setActionLoading(false); }
  };

  const doEdit = async (values: any) => {
    try {
      setActionLoading(true);
      await api.suppliers.update(id, values);
      message.success('供应商信息已更新');
      setEditOpen(false); editForm.resetFields();
      setTimeout(fetchData, 800);
    } catch (e: any) { message.error(e.response?.data?.error || '操作失败'); }
    finally { setActionLoading(false); }
  };

  if (notFound) {
    return (
      <Card>
        <Result status="404" title="供应商不存在" subTitle={`未找到供应商 ${id}`}
          extra={<Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/suppliers')}>返回列表</Button>}
        />
      </Card>
    );
  }

  const riskLevel = detail?.riskLevel || 'LOW';
  const isBlacklisted = detail?.blacklisted;

  const trendOption = detail?.monthlyStats ? {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: detail.monthlyStats.map((m: any) => m.month), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value' },
    legend: { data: ['交易笔数', '风险命中'], top: 0 },
    series: [
      { name: '交易笔数', type: 'bar', data: detail.monthlyStats.map((m: any) => m.count), itemStyle: { color: '#1677ff', borderRadius: [4, 4, 0, 0] } },
      { name: '风险命中', type: 'line', smooth: true, data: detail.monthlyStats.map((m: any) => m.flagged), itemStyle: { color: '#ff4d4f' }, lineStyle: { width: 3 } },
    ],
  } : {};

  return (
    <div className="space-y-4">
      {/* 顶部标题栏 */}
      <Card size="small" className={`!rounded-xl shadow-sm !border-l-4 ${isBlacklisted ? '!border-l-red-700' : ''}`}
        style={{ borderLeftColor: isBlacklisted ? '#8b0000' : RISK_COLORS[riskLevel] }}>
        <Row align="middle" gutter={[16, 8]}>
          <Col flex="auto">
            <Space direction="vertical" size={2}>
              <Space>
                <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/suppliers')}>返回列表</Button>
                <h2 className="!m-0 text-lg font-bold">
                  <TeamOutlined className="text-purple-500 mr-1" />供应商档案
                  <Tag color="purple" className="ml-2 font-mono">{detail?.code || '-'}</Tag>
                </h2>
              </Space>
              <div className="text-base font-semibold text-gray-800">
                {detail?.name || '-'}
                {detail?.legalName && detail.legalName !== detail.name && (
                  <span className="ml-2 text-sm font-normal text-gray-500">（{detail.legalName}）</span>
                )}
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              {isBlacklisted ? (
                <Tag color="red" icon={<LockOutlined />} className="!text-sm !px-3 !py-1">黑名单中</Tag>
              ) : (
                <Tag color={RISK_COLORS[riskLevel]} className="!text-sm !px-3 !py-1">
                  <SafetyOutlined /> {RISK_LABELS[riskLevel]}
                </Tag>
              )}
              <Tag color="blue">{detail?.country || '-'}</Tag>

              {hasPermission('supplier:update') && !isBlacklisted && (
                <Button size="small" icon={<DatabaseOutlined />} onClick={() => { editForm.setFieldsValue({ ...detail }); setEditOpen(true); }}>编辑信息</Button>
              )}
              {hasPermission('supplier:rescreen') && (
                <Button size="small" icon={<ReloadOutlined />} onClick={async () => {
                  try { await api.suppliers.rescreen(id); message.success('已提交重新筛查任务'); setTimeout(fetchData, 2000); } catch (e) { /* ignore */ }
                }}>重新筛查</Button>
              )}
              {hasPermission('supplier:blacklist') && !isBlacklisted && (
                <Button size="small" danger icon={<LockOutlined />} onClick={() => setBlacklistOpen(true)}>加入黑名单</Button>
              )}
              {hasPermission('supplier:unblock') && isBlacklisted && (
                <Button size="small" type="primary" icon={<UnlockOutlined />} onClick={() => setUnblockOpen(true)}>解除黑名单</Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      <Spin spinning={loading}>
        {detail && (
          <>
            {/* 黑名单警告 */}
            {isBlacklisted && (
              <Alert
                type="error" showIcon
                icon={<LockOutlined />}
                message="该供应商已被加入黑名单"
                description={
                  <div className="space-y-1">
                    <div>加入时间: {dayjs(detail.blacklistedAt).format('YYYY-MM-DD HH:mm')}</div>
                    <div>操作人: {detail.blacklistedBy?.name || '-'}</div>
                    {detail.blacklistReason && <div>原因: <span className="font-medium">{detail.blacklistReason}</span></div>}
                    {detail.blacklistNotes && <div>备注: {detail.blacklistNotes}</div>}
                  </div>
                }
                className="!rounded-xl"
              />
            )}

            {/* 指标卡 */}
            <Row gutter={[16, 16]}>
              <Col xs={12} md={6}>
                <Card className="!rounded-xl shadow-sm h-full" size="small">
                  <Statistic title="风险评分" value={detail.riskScore || 0}
                    valueStyle={{ color: RISK_COLORS[riskLevel] }}
                    prefix={<SafetyOutlined />} />
                  <Progress percent={Math.min(detail.riskScore || 0, 100)}
                    strokeColor={RISK_COLORS[riskLevel]} size="small" />
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card className="!rounded-xl shadow-sm h-full" size="small">
                  <Statistic title="累计交易" value={detail.stats?.totalTransactions || 0}
                    formatter={formatNumber} prefix={<DatabaseOutlined />} />
                  <div className="text-xs text-gray-500 mt-1">
                    总金额: <span className="font-mono font-semibold">{formatCurrency(detail.stats?.totalAmount || 0, detail.currency || 'USD')}</span>
                  </div>
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card className="!rounded-xl shadow-sm h-full" size="small">
                  <Statistic title="风险命中" value={detail.stats?.flaggedCount || 0}
                    valueStyle={{ color: '#fa8c16' }} prefix={<ThunderboltOutlined />} />
                  <div className="text-xs text-gray-500 mt-1">
                    命中率: <span className="font-mono font-semibold text-orange-600">{formatPercent(detail.stats?.hitRate)}</span>
                  </div>
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card className="!rounded-xl shadow-sm h-full" size="small">
                  <Statistic title="拒绝/被拦截" value={detail.stats?.rejectedCount || 0}
                    valueStyle={{ color: '#ff4d4f' }} prefix={<CloseCircleOutlined />} />
                  <div className="text-xs text-gray-500 mt-1">
                    上次交易: {detail.stats?.lastTransactionAt ? dayjs(detail.stats.lastTransactionAt).format('YYYY-MM-DD') : '无记录'}
                  </div>
                </Card>
              </Col>
            </Row>

            {/* 基本信息 */}
            <Row gutter={[16, 16]}>
              <Col xs={24} md={14}>
                <Card title={<Space><UserOutlined className="text-purple-500" />基本信息</Space>}
                  className="!rounded-xl shadow-sm" size="small">
                  <Descriptions column={2} size="small" bordered>
                    <Descriptions.Item label="供应商编号"><code className="text-xs">{detail.code}</code></Descriptions.Item>
                    <Descriptions.Item label="供应商名称" className="font-semibold">{detail.name}</Descriptions.Item>
                    <Descriptions.Item label="法定名称" span={2}>{detail.legalName || detail.name}</Descriptions.Item>
                    <Descriptions.Item label="企业类型">{detail.entityType || '-'}</Descriptions.Item>
                    <Descriptions.Item label="注册国家/地区">{detail.country ? `${COUNTRIES[detail.country] || detail.country} (${detail.country})` : '-'}</Descriptions.Item>
                    <Descriptions.Item label="统一编号/税号"><code className="text-xs">{detail.taxId || detail.registrationNumber || '-'}</code></Descriptions.Item>
                    <Descriptions.Item label="成立日期">{detail.establishedDate ? dayjs(detail.establishedDate).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
                    <Descriptions.Item label="联系人">{detail.contactPerson || '-'}</Descriptions.Item>
                    <Descriptions.Item label="联系电话">{detail.phone || '-'}</Descriptions.Item>
                    <Descriptions.Item label="邮箱" span={2}>{detail.email || '-'}</Descriptions.Item>
                    <Descriptions.Item label="注册地址" span={2}>{detail.address || '-'}</Descriptions.Item>
                    <Descriptions.Item label="主营行业">{detail.industry || '-'}</Descriptions.Item>
                    <Descriptions.Item label="合作等级">{detail.tier ? `Tier ${detail.tier}` : '-'}</Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
              <Col xs={24} md={10}>
                <Card title={<Space><TeamOutlined className="text-indigo-500" />受益所有人/关键人</Space>}
                  className="!rounded-xl shadow-sm" size="small">
                  {detail.beneficialOwners?.length ? (
                    <List
                      size="small"
                      dataSource={detail.beneficialOwners}
                      renderItem={(p: any, i) => (
                        <List.Item className="!px-0 !border-0 !border-b !border-gray-100 last:!border-0">
                          <Row align="middle" className="w-full" gutter={[8, 0]}>
                            <Col>
                              <Avatar icon={<UserOutlined />} />
                            </Col>
                            <Col flex="auto">
                              <div className="font-medium">{p.name}</div>
                              <div className="text-xs text-gray-500">
                                {p.title || '受益所有人'} {p.country ? `· ${p.country}` : ''}
                                {p.ownershipPct ? ` · 持股 ${p.ownershipPct}%` : ''}
                              </div>
                            </Col>
                            <Col>
                              {p.isPep && <Tag color="orange">PEP</Tag>}
                              {p.isSanctioned && <Tag color="red">制裁命中</Tag>}
                            </Col>
                          </Row>
                        </List.Item>
                      )}
                    />
                  ) : <Empty description="暂无受益人信息" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
                </Card>

                <Divider className="!my-3" />

                <Card title={<Space><CheckCircleOutlined className="text-green-500" />尽职调查信息</Space>}
                  className="!rounded-xl shadow-sm" size="small">
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="KYC状态">
                      {detail.kycStatus ? (
                        <Tag color={detail.kycStatus === 'COMPLETED' ? 'green' : detail.kycStatus === 'PENDING' ? 'orange' : 'red'}>
                          {detail.kycStatus === 'COMPLETED' ? '已完成' : detail.kycStatus === 'PENDING' ? '进行中' : '待补充'}
                        </Tag>
                      ) : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="最后尽调">
                      {detail.lastDueDiligenceDate ? dayjs(detail.lastDueDiligenceDate).format('YYYY-MM-DD') : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="下次尽调">
                      {detail.nextDueDiligenceDate ? (
                        <Space>
                          {dayjs(detail.nextDueDiligenceDate).format('YYYY-MM-DD')}
                          {dayjs(detail.nextDueDiligenceDate).isBefore(dayjs()) && <Tag color="red">已逾期</Tag>}
                        </Space>
                      ) : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="风险备注">
                      <div className="text-xs text-gray-600">{detail.riskNotes || '无'}</div>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
            </Row>

            {/* 交易趋势 */}
            {detail.monthlyStats?.length > 0 && (
              <Card title={<Space><DatabaseOutlined className="text-blue-500" />近6个月交易趋势</Space>}
                className="!rounded-xl shadow-sm" size="small">
                <ReactECharts option={trendOption} style={{ height: 260 }} notMerge />
              </Card>
            )}

            {/* 最近交易 */}
            <Card title={<Space><DatabaseOutlined className="text-blue-500" />最近交易记录 ({recentTrans.length})</Space>}
              className="!rounded-xl shadow-sm" size="small"
              extra={<Button size="small" onClick={() => navigate('/transactions')}>查看全部 →</Button>}>
              {recentTrans.length ? (
                <List
                  size="small"
                  dataSource={recentTrans}
                  renderItem={(t: any) => (
                    <List.Item
                      className="!px-0 !border-0 !border-b !border-gray-100 last:!border-0 cursor-pointer hover:bg-blue-50"
                      onClick={() => navigate(`/transactions/${t._id}`)}
                    >
                      <Row align="middle" className="w-full" gutter={[8, 0]}>
                        <Col xs={24} md={6}>
                          <div className="font-mono font-semibold">{t.transactionId}</div>
                          <div className="text-xs text-gray-500">{t.poNumber || '-'}</div>
                        </Col>
                        <Col xs={12} md={4}>
                          <div className="text-sm font-bold">{formatCurrency(t.amount, t.currency)}</div>
                        </Col>
                        <Col xs={12} md={4}>
                          <Tag color="geekblue" className="font-mono !text-xs">{t.hsCode || '-'}</Tag>
                          <div className="text-xs text-gray-500">{t.originCountry}</div>
                        </Col>
                        <Col xs={12} md={5}>
                          <Tag color={RISK_COLORS[t.riskLevel]} className="!text-xs">
                            {RISK_LABELS[t.riskLevel]} ({t.riskScore || 0}分)
                          </Tag>
                        </Col>
                        <Col xs={12} md={5} className="text-right">
                          <Tag color={TRANSACTION_STATUS_COLORS[t.status]} className="!text-xs">
                            {TRANSACTION_STATUS_LABELS[t.status]}
                          </Tag>
                          <div className="text-xs text-gray-500 mt-1">{dayjs(t.createdAt).format('MM-DD HH:mm')}</div>
                        </Col>
                      </Row>
                    </List.Item>
                  )}
                />
              ) : <Empty description="暂无交易记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
            </Card>

            {/* 操作历史 */}
            <Card title={<Space><ClockCircleOutlined className="text-blue-500" />操作与变更历史</Space>}
              className="!rounded-xl shadow-sm" size="small">
              {history.length ? (
                <Timeline
                  mode="left"
                  items={history.map((h: any) => ({
                    color: h.severity === 'ERROR' ? 'red' : h.severity === 'WARNING' ? 'orange' : 'blue',
                    label: <span className="font-mono text-xs text-gray-500 whitespace-nowrap">{dayjs(h.createdAt).format('YYYY-MM-DD HH:mm')}</span>,
                    children: (
                      <div className="pb-3">
                        <div className="font-medium text-sm flex items-center gap-2">
                          <Tag color="geekblue" className="!text-xs !m-0">{h.action}</Tag>
                          {h.user?.name && <span className="text-xs text-gray-500">by {h.user.name}</span>}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">{h.description}</div>
                        {h.details && (
                          <pre className="bg-gray-50 p-2 rounded text-xs mt-2 overflow-auto max-h-32">
                            {typeof h.details === 'string' ? h.details : JSON.stringify(h.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    ),
                  }))}
                />
              ) : <Empty description="暂无操作记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
            </Card>
          </>
        )}
      </Spin>

      {/* 加入黑名单模态 */}
      <Modal
        title={<Space><LockOutlined className="text-red-500" />确认加入黑名单</Space>}
        open={blacklistOpen} onCancel={() => setBlacklistOpen(false)} footer={null} destroyOnClose width={560}>
        <Alert type="error" showIcon className="mb-4"
          message="此操作将永久标记该供应商"
          description={
            <ul className="text-sm list-disc list-inside space-y-1 m-0">
              <li>该供应商未来所有新交易将被自动拦截并冻结</li>
              <li>系统会记录加入黑名单的原因和操作人，不可删除</li>
              <li>仅合规总监及以上权限可解除</li>
            </ul>
          } />
        <Form form={blacklistForm} layout="vertical" onFinish={doBlacklist}
          initialValues={{ rejectPending: true }}>
          <Form.Item name="reason" label="拉黑原因" rules={[{ required: true, message: '请选择原因' }]}>
            <Select placeholder="请选择或输入">
              <Option value="SANCTION_LISTED">命中制裁名单</Option>
              <Option value="FRAUD">欺诈/虚假文件</Option>
              <Option value="COMPLIANCE_VIOLATION">严重合规违规</Option>
              <Option value="MULTIPLE_REJECTIONS">多次高风险拒绝记录</Option>
              <Option value="KYC_FAILURE">KYC尽职调查不通过</Option>
              <Option value="OTHER">其他原因（请备注）</Option>
            </Select>
          </Form.Item>
          <Form.Item name="notes" label="详细说明">
            <TextArea rows={3} placeholder="请填写详细说明，作为审计依据..." />
          </Form.Item>
          <Form.Item name="rejectPending" valuePropName="checked">
            <Checkbox>同时将该供应商所有 <b>待审查/已冻结</b> 的交易自动拒绝</Checkbox>
          </Form.Item>
          <Form.Item className="!mb-0 text-right">
            <Space>
              <Button onClick={() => setBlacklistOpen(false)}>取消</Button>
              <Button type="primary" danger icon={<LockOutlined />} htmlType="submit" loading={actionLoading}>
                确认加入黑名单
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 解除黑名单模态 */}
      <Modal
        title={<Space><UnlockOutlined className="text-green-500" />解除黑名单确认</Space>}
        open={unblockOpen} onCancel={() => setUnblockOpen(false)} footer={null} destroyOnClose>
        <Alert type="warning" showIcon className="mb-4"
          message="请确认解除此供应商黑名单"
          description="解除后该供应商可参与新交易，但历史被拒绝交易不会自动恢复。请确保已重新完成KYC尽职调查。" />
        <Form form={unblockForm} layout="vertical" onFinish={doUnblock}>
          <Form.Item name="reason" label="解除理由" rules={[{ required: true, message: '请输入解除理由' }]}>
            <TextArea rows={4} placeholder="请说明解除依据，如：KYC复核通过、制裁名单移除证明、合规整改报告等..." />
          </Form.Item>
          <Form.Item className="!mb-0 text-right">
            <Space>
              <Button onClick={() => setUnblockOpen(false)}>取消</Button>
              <Button type="primary" icon={<UnlockOutlined />} htmlType="submit" loading={actionLoading}>
                确认解除
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑信息模态 */}
      <Modal
        title={<Space><DatabaseOutlined className="text-blue-500" />编辑供应商信息</Space>}
        open={editOpen} onCancel={() => setEditOpen(false)} footer={null} destroyOnClose width={720}>
        <Form form={editForm} layout="vertical" onFinish={doEdit}>
          <Row gutter={[16, 0]}>
            <Col xs={24} sm={12}>
              <Form.Item name="name" label="供应商名称" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="legalName" label="法定名称">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="country" label="国家/地区代码">
                <Select showSearch>
                  {Object.entries(COUNTRIES).map(([code, name]) => (
                    <Option key={code} value={code}>{name} ({code})</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="taxId" label="税号/注册号">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="tier" label="合作等级">
                <Select allowClear>
                  {[1, 2, 3, 4, 5].map((t) => (
                    <Option key={t} value={t}>Tier {t}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="contactPerson" label="联系人">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="email" label="联系邮箱" rules={[{ type: 'email' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="phone" label="电话">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="industry" label="行业">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="address" label="注册地址">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="riskNotes" label="风险备注/特殊说明">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item className="!mb-0 text-right">
            <Space>
              <Button onClick={() => setEditOpen(false)}>取消</Button>
              <Button type="primary" icon={<DatabaseOutlined />} htmlType="submit" loading={actionLoading}>保存修改</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SupplierDetail;
