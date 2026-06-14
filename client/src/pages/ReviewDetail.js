import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Spin, message, Result, Descriptions, Row, Col, Tag, Progress, Divider, List, Space, Tooltip, Timeline, Modal, Form, Input, Select, Avatar, Statistic, Alert, Empty, Checkbox } from 'antd';
import { ArrowLeftOutlined, UserOutlined, TeamOutlined, FileSearchOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, ThunderboltOutlined, SafetyOutlined, SendOutlined, ExclamationCircleOutlined, ReloadOutlined, WarningOutlined, RiseOutlined } from '@ant-design/icons';
import { api } from '../services/api';
import { RISK_COLORS, RISK_LABELS, REVIEW_STATUS_LABELS, REVIEW_STATUS_COLORS, formatCurrency, formatNumber, formatPercent, useUserStore } from '../store';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;

const ReviewDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const hasPermission = useUserStore((s) => s.hasPermission);
  const user = useUserStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [approveForm] = Form.useForm();
  const [rejectForm] = Form.useForm();
  const [escalateForm] = Form.useForm();
  const [assignForm] = Form.useForm();
  const [officers, setOfficers] = useState([]);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, workload] = await Promise.all([
        api.reviews.get(id),
        api.reviews.workload().catch(() => ({ officers: [] })),
      ]);
      setDetail(d);
      setOfficers((workload).officers || []);
    } catch (e) {
      if (e.response?.status === 404) setNotFound(true);
      else message.error('加载工单详情失败');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [id]);

  const isOverdue = detail?.reviewDeadline && dayjs(detail.reviewDeadline).isBefore(dayjs());
  const remainingHours = detail?.reviewDeadline
    ? Math.max(0, dayjs(detail.reviewDeadline).diff(dayjs(), 'hour', true))
    : 0;
  const totalSLA = detail?.riskLevel === 'CRITICAL' ? 4 : 24;

  const doApprove = async (values) => {
    try {
      setActionLoading(true);
      await api.reviews.approve(id, values.notes);
      message.success('审查通过，交易已放行');
      setApproveOpen(false); approveForm.resetFields();
      setTimeout(fetchData, 800);
    } catch (e) { message.error(e.response?.data?.error || '操作失败'); }
    finally { setActionLoading(false); }
  };

  const doReject = async (values) => {
    try {
      setActionLoading(true);
      const payload = { reason: values.reason, notes: values.notes };
      if (values.blacklistSupplier) payload.blacklistSupplier = true;
      await api.reviews.reject(id, payload);
      message.success('审查已拒绝，交易已拦截');
      setRejectOpen(false); rejectForm.resetFields();
      setTimeout(fetchData, 800);
    } catch (e) { message.error(e.response?.data?.error || '操作失败'); }
    finally { setActionLoading(false); }
  };

  const doEscalate = async (values) => {
    try {
      setActionLoading(true);
      await api.reviews.escalate(id, values.reason);
      message.success('已升级至合规总监');
      setEscalateOpen(false); escalateForm.resetFields();
      setTimeout(fetchData, 800);
    } catch (e) { message.error(e.response?.data?.error || '操作失败'); }
    finally { setActionLoading(false); }
  };

  const doAssign = async (values) => {
    try {
      setActionLoading(true);
      await api.reviews.assign(id, values.assignTo);
      message.success('工单已分配');
      setAssignOpen(false); assignForm.resetFields();
      setTimeout(fetchData, 800);
    } catch (e) { message.error(e.response?.data?.error || '操作失败'); }
    finally { setActionLoading(false); }
  };

  if (notFound) {
    return (
      <Card>
        <Result status="404" title="工单不存在" subTitle={`未找到工单 ${id}`}
          extra={<Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/reviews')}>返回工单列表</Button>}
        />
      </Card>
    );
  }

  const canReview = hasPermission('review:decision') &&
    ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED'].includes(detail?.status) &&
    (detail?.assignedTo?._id === user?._id || hasPermission('review:escalate') || detail?.status === 'PENDING');

  return (
    <div className="space-y-4">
      {/* 顶部栏 */}
      <Card size="small" className={`!rounded-xl shadow-sm border-l-4 ${isOverdue ? '!border-l-red-600' : ''}`}
        style={{ borderLeftColor: isOverdue ? '#dc2626' : RISK_COLORS[detail?.riskLevel] || '#1677ff' }}>
        <Row align="middle" gutter={[16, 8]}>
          <Col flex="auto">
            <Space direction="vertical" size={2}>
              <Space>
                <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/reviews')}>返回列表</Button>
                <h2 className="!m-0 text-lg font-bold">
                  <FileSearchOutlined className="text-purple-500 mr-1" />合规审查工单
                  <Tag color="blue" className="ml-2 font-mono">{detail?.ticketId || '-'}</Tag>
                </h2>
              </Space>
              <div className="text-xs text-gray-500">
                创建于 {dayjs(detail?.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                {detail?.createdBy?.name && ` · 创建人: ${detail.createdBy.name}`}
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Tag color={REVIEW_STATUS_COLORS[detail?.status]} className="!text-sm">
                {REVIEW_STATUS_LABELS[detail?.status]}
              </Tag>
              {isOverdue && <Tag color="red" icon={<WarningOutlined />}>SLA已超时</Tag>}
              {detail?.escalated && <Tag color="orange" icon={<RiseOutlined />}>已升级</Tag>}

              {detail?.status === 'PENDING' && hasPermission('review:assign') && (
                <Button size="small" icon={<TeamOutlined />} onClick={() => setAssignOpen(true)}>分配工单</Button>
              )}
              {canReview && !['APPROVED', 'REJECTED', 'CLOSED'].includes(detail?.status || '') && (
                <>
                  <Button size="small" icon={<RiseOutlined />}
                    onClick={() => setEscalateOpen(true)} disabled={detail?.escalated}>
                    {detail?.escalated ? '已升级' : '升级总监'}
                  </Button>
                  <Button size="small" type="primary" danger icon={<CloseCircleOutlined />}
                    onClick={() => setRejectOpen(true)}>拒绝交易</Button>
                  <Button size="small" type="primary" icon={<CheckCircleOutlined />}
                    onClick={() => setApproveOpen(true)}>审查通过</Button>
                </>
              )}
              <Button size="small" icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Spin spinning={loading}>
        {detail && (
          <>
            {/* SLA进度条 + 指标卡 */}
            <Row gutter={[16, 16]}>
              <Col xs={24} md={6}>
                <Card className="!rounded-xl shadow-sm h-full" size="small">
                  <Statistic
                    title="风险等级"
                    value={RISK_LABELS[detail.riskLevel] || '-'}
                    valueStyle={{ color: RISK_COLORS[detail.riskLevel], fontSize: 18 }}
                    prefix={<SafetyOutlined />}
                  />
                  <div className="mt-2">
                    <Progress percent={Math.min(detail.riskScore, 100)}
                      strokeColor={RISK_COLORS[detail.riskLevel]} size="small" />
                  </div>
                </Card>
              </Col>
              <Col xs={24} md={6}>
                <Card className={`!rounded-xl shadow-sm h-full ${isOverdue ? '!border-2 !border-red-200' : ''}`} size="small">
                  <Statistic
                    title="SLA 审查时限"
                    value={remainingHours.toFixed(1)}
                    suffix="小时"
                    valueStyle={{ color: isOverdue ? '#dc2626' : remainingHours < totalSLA * 0.2 ? '#fa8c16' : '#52c41a', fontSize: 22 }}
                    prefix={<ClockCircleOutlined />}
                  />
                  <div className="mt-2 text-xs text-gray-500">
                    截止: {dayjs(detail.reviewDeadline).format('MM-DD HH:mm')}
                  </div>
                  <Progress
                    percent={Math.min((1 - remainingHours / totalSLA) * 100, 100)}
                    size="small"
                    strokeColor={isOverdue ? '#dc2626' : remainingHours < totalSLA * 0.2 ? '#fa8c16' : '#52c41a'}
                  />
                </Card>
              </Col>
              <Col xs={24} md={6}>
                <Card className="!rounded-xl shadow-sm h-full" size="small">
                  <Statistic
                    title="分配审查员"
                    value={detail.assignedTo?.name || '待分配'}
                    valueStyle={{ fontSize: 16 }}
                    prefix={<UserOutlined />}
                  />
                  <div className="mt-2 text-xs text-gray-500">
                    {detail.assignedTo
                      ? <>角色: <Tag color="purple" className="!text-xs">{detail.assignedTo.role}</Tag> 分配于 {dayjs(detail.assignedAt).format('MM-DD HH:mm')}</>
                      : '当前无审查员，需先分配'}
                  </div>
                </Card>
              </Col>
              <Col xs={24} md={6}>
                <Card className="!rounded-xl shadow-sm h-full" size="small">
                  <Statistic
                    title="审查用时"
                    value={detail.reviewDurationHours ? detail.reviewDurationHours.toFixed(1) : '-'}
                    suffix={detail.reviewDurationHours ? '小时' : ''}
                    valueStyle={{ fontSize: 18 }}
                    prefix={<ClockCircleOutlined />}
                  />
                  <div className="mt-2 text-xs text-gray-500">
                    {detail.reviewedAt ? `完成于 ${dayjs(detail.reviewedAt).format('MM-DD HH:mm')}` : '审查进行中'}
                  </div>
                </Card>
              </Col>
            </Row>

            {/* 风险摘要 */}
            <Alert
              type={detail.riskLevel === 'CRITICAL' ? 'error' : detail.riskLevel === 'HIGH' ? 'warning' : 'info'}
              showIcon
              icon={<ThunderboltOutlined />}
              message={`${RISK_LABELS[detail.riskLevel]}风险摘要 (${detail.riskScore}分)`}
              description={
                <div className="space-y-1">
                  <div>关联交易: {detail.transaction?.transactionId} · {formatCurrency(detail.transaction?.amount, detail.transaction?.currency)}</div>
                  <div>风险因子: {detail.riskFactors?.map((f) => `${f.name}(${f.weight}分)`).join('、') || '无'}</div>
                  {detail.sanctionMatches?.length > 0 && (
                    <div className="font-semibold">制裁命中: <Tag color="red">{detail.sanctionMatches.length} 条</Tag></div>
                  )}
                </div>
              }
              className="!rounded-xl shadow-sm"
            />

            {/* 审查结论 */}
            {['APPROVED', 'REJECTED'].includes(detail.status) && (
              <Card title={<Space>{detail.status === 'APPROVED' ? <CheckCircleOutlined className="text-green-500" /> : <CloseCircleOutlined className="text-red-500" />}审查结论</Space>}
                className={`!rounded-xl shadow-sm ${detail.status === 'APPROVED' ? '!border-l-4 !border-l-green-500' : '!border-l-4 !border-l-red-500'}`} size="small">
                <Descriptions column={2} size="small">
                  <Descriptions.Item label="决定">
                    <Tag color={detail.status === 'APPROVED' ? 'green' : 'red'} icon={detail.status === 'APPROVED' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
                      {detail.status === 'APPROVED' ? '通过放行' : '拒绝拦截'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="审查人">
                    <Space><Avatar size="small" icon={<UserOutlined />} />{detail.reviewedBy?.name || '-'}</Space>
                  </Descriptions.Item>
                  <Descriptions.Item label="原因/理由" span={2}>
                    <div className="text-sm bg-gray-50 p-2 rounded">{detail.rejectReason || detail.approveNotes || '无详细说明'}</div>
                  </Descriptions.Item>
                  <Descriptions.Item label="附加备注" span={2}>
                    <div className="text-sm text-gray-600">{detail.reviewNotes || '-'}</div>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            {/* 关联交易 */}
            <Card title={<Space><SafetyOutlined className="text-blue-500" />关联交易信息</Space>} className="!rounded-xl shadow-sm" size="small">
              {detail.transaction ? (
                <Descriptions column={2} size="small" bordered>
                  <Descriptions.Item label="交易编号">
                    <span className="font-mono cursor-pointer hover:text-blue-600"
                      onClick={() => navigate(`/transactions/${detail.transaction._id}`)}>
                      {detail.transaction.transactionId}
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="PO号">{detail.transaction.poNumber || '-'}</Descriptions.Item>
                  <Descriptions.Item label="交易金额" span={2}>
                    <span className="text-lg font-bold">{formatCurrency(detail.transaction.amount, detail.transaction.currency)}</span>
                  </Descriptions.Item>
                  <Descriptions.Item label="供应商">
                    <Space>
                      <TeamOutlined className="text-purple-500" />
                      <span>{detail.transaction.supplier?.name || '-'}</span>
                      {detail.transaction.supplier?.riskLevel && <Tag color={RISK_COLORS[detail.transaction.supplier.riskLevel]}>{RISK_LABELS[detail.transaction.supplier.riskLevel]}</Tag>}
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label="HS编码">
                    <Tag color="geekblue" className="font-mono">{detail.transaction.hsCode || '-'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="原产国">{detail.transaction.originCountry || '-'}</Descriptions.Item>
                  <Descriptions.Item label="最终用户/目的国">
                    <Space>{detail.transaction.endUser && <Tag color="purple">{detail.transaction.endUser}</Tag>}{detail.transaction.destinationCountry}</Space>
                  </Descriptions.Item>
                </Descriptions>
              ) : <Empty description="无关联交易信息" />}
            </Card>

            {/* 制裁命中 */}
            <Card
              title={<Space><SafetyOutlined className="text-red-500" />制裁名单命中 ({detail.sanctionMatches?.length || 0})</Space>}
              className="!rounded-xl shadow-sm" size="small"
            >
              {detail.sanctionMatches?.length ? (
                <List
                  dataSource={detail.sanctionMatches}
                  renderItem={(m) => (
                    <List.Item className="!px-0">
                      <Card size="small" className="w-full !rounded-lg border-l-4 !border-l-red-500">
                        <Row gutter={[12, 8]} align="middle">
                          <Col xs={24} md={6}>
                            <Tag color="volcano">{m.listName}</Tag>
                            <div className="font-medium mt-1">{m.matchedName}</div>
                            <div className="text-xs text-gray-500">{m.entityType} · {m.entryId}</div>
                          </Col>
                          <Col xs={24} md={4}>
                            <Tag color="blue">{m.matchType}</Tag>
                          </Col>
                          <Col xs={24} md={5}>
                            相似度
                            <Progress percent={Math.round((m.similarity || 0) * 100)} size="small"
                              strokeColor={(m.similarity || 0) >= 0.95 ? '#ff4d4f' : '#fa8c16'} />
                          </Col>
                          <Col xs={24} md={9}>
                            <div className="text-xs text-gray-500">匹配字段: <span className="text-gray-700">{m.matchedField}</span></div>
                            {m.countries && <div className="text-xs mt-1">涉及国家: {m.countries.join('、')}</div>}
                            {m.aliases?.length > 0 && <div className="text-xs mt-1 text-gray-500">别名: {m.aliases.slice(0, 3).join('、')}{m.aliases.length > 3 ? `等${m.aliases.length}个` : ''}</div>}
                          </Col>
                        </Row>
                      </Card>
                    </List.Item>
                  )}
                />
              ) : <div className="text-gray-400 text-sm text-center py-8">无制裁命中</div>}
            </Card>

            {/* 时间线 */}
            <Card title={<Space><ClockCircleOutlined className="text-blue-500" />审查时间线</Space>} className="!rounded-xl shadow-sm" size="small">
              <Timeline
                mode="left"
                items={[
                  detail.reviewedAt && {
                    color: detail.status === 'APPROVED' ? 'green' : 'red',
                    label: <span className="font-mono text-xs text-gray-500 whitespace-nowrap">{dayjs(detail.reviewedAt).format('YYYY-MM-DD HH:mm')}</span>,
                    children: (
                      <div className="pb-2">
                        <div className="font-medium">
                          {detail.status === 'APPROVED' ? <CheckCircleOutlined className="text-green-500 mr-1" /> : <CloseCircleOutlined className="text-red-500 mr-1" />}
                          审查完成 - {detail.status === 'APPROVED' ? '通过放行' : '拒绝交易'}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">审查员: {detail.reviewedBy?.name}</div>
                        {(detail.rejectReason || detail.approveNotes) && (
                          <div className="text-sm text-gray-600 mt-1 bg-gray-50 p-2 rounded">📝 {detail.rejectReason || detail.approveNotes}</div>
                        )}
                      </div>
                    ),
                  },
                  detail.escalated && detail.escalatedAt && {
                    color: 'orange',
                    label: <span className="font-mono text-xs text-gray-500 whitespace-nowrap">{dayjs(detail.escalatedAt).format('YYYY-MM-DD HH:mm')}</span>,
                    children: (
                      <div className="pb-2">
                        <div className="font-medium"><RiseOutlined className="text-orange-500 mr-1" />工单升级至合规总监</div>
                        <div className="text-xs text-gray-500 mt-0.5">操作人: {detail.escalatedBy?.name || '系统自动'}</div>
                        {detail.escalateReason && <div className="text-sm mt-1 bg-orange-50 p-2 rounded">📝 {detail.escalateReason}</div>}
                      </div>
                    ),
                  },
                  detail.assignedAt && {
                    color: 'purple',
                    label: <span className="font-mono text-xs text-gray-500 whitespace-nowrap">{dayjs(detail.assignedAt).format('YYYY-MM-DD HH:mm')}</span>,
                    children: (
                      <div className="pb-2">
                        <div className="font-medium"><TeamOutlined className="text-purple-500 mr-1" />工单分配给 {detail.assignedTo?.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">角色: {detail.assignedTo?.role}</div>
                      </div>
                    ),
                  },
                  {
                    color: 'blue',
                    label: <span className="font-mono text-xs text-gray-500 whitespace-nowrap">{dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm')}</span>,
                    children: (
                      <div className="pb-2">
                        <div className="font-medium"><FileSearchOutlined className="text-blue-500 mr-1" />工单创建</div>
                        <div className="text-xs text-gray-500 mt-0.5">创建人: {detail.createdBy?.name || '系统自动'}</div>
                        {detail.reviewDeadline && <div className="text-xs mt-0.5">审查时限: {dayjs(detail.reviewDeadline).format('YYYY-MM-DD HH:mm')}</div>}
                      </div>
                    ),
                  },
                ].filter(Boolean)}
              />
            </Card>

            {/* 审计历史 */}
            {detail.auditLogs?.length > 0 && (
              <Card title="审计记录" className="!rounded-xl shadow-sm" size="small">
                <List
                  size="small"
                  dataSource={detail.auditLogs}
                  renderItem={(log) => (
                    <List.Item className="!px-0">
                      <Row className="w-full" align="middle" gutter={[8, 0]}>
                        <Col span={6} className="text-xs font-mono text-gray-500">{dayjs(log.createdAt).format('MM-DD HH:mm:ss')}</Col>
                        <Col span={4}><Tag color="geekblue" className="!text-xs !m-0">{log.action}</Tag></Col>
                        <Col span={4}>{log.user?.name || '-'}</Col>
                        <Col flex="auto" className="text-sm text-gray-700">{log.description}</Col>
                      </Row>
                    </List.Item>
                  )}
                />
              </Card>
            )}
          </>
        )}
      </Spin>

      {/* 通过模态 */}
      <Modal title={<Space><CheckCircleOutlined className="text-green-500" />审查通过确认</Space>}
        open={approveOpen} onCancel={() => setApproveOpen(false)} footer={null} destroyOnClose>
        <Alert type="success" showIcon className="mb-4"
          message="确认通过此交易合规审查？"
          description="通过后，关联交易将自动放行，状态更新为 'APPROVED'，供应商历史记录将计入。" />
        <Form form={approveForm} layout="vertical" onFinish={doApprove}>
          <Form.Item name="notes" label="审查备注（可选）">
            <TextArea rows={4} placeholder="请输入审查意见或说明（将作为审计留痕）" />
          </Form.Item>
          <Form.Item className="!mb-0 text-right">
            <Space>
              <Button onClick={() => setApproveOpen(false)}>取消</Button>
              <Button type="primary" icon={<CheckCircleOutlined />} htmlType="submit" loading={actionLoading}>确认通过</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 拒绝模态 */}
      <Modal title={<Space><CloseCircleOutlined className="text-red-500" />审查拒绝确认</Space>}
        open={rejectOpen} onCancel={() => setRejectOpen(false)} footer={null} destroyOnClose>
        <Alert type="error" showIcon className="mb-4"
          message="确认拒绝此交易？"
          description="拒绝后，关联交易将标记为 'REJECTED' 永久拦截，系统将向供应商发出拒绝通知。" />
        <Form form={rejectForm} layout="vertical" onFinish={doReject}>
          <Form.Item name="reason" label="拒绝原因" rules={[{ required: true, message: '请输入拒绝原因' }]}>
            <Select placeholder="请选择或输入拒绝原因">
              <Option value="SANCTION_LISTED">命中制裁名单（SDN/欧盟等）</Option>
              <Option value="HS_CODE_RESTRICTED">HS编码受管制</Option>
              <Option value="COUNTRY_EMBARGO">原产国/目的国禁运</Option>
              <Option value="END_USER_SENSITIVE">最终用户敏感用途</Option>
              <Option value="SUPPLIER_BLACKLIST">供应商已在黑名单</Option>
              <Option value="INSUFFICIENT_DUE_DILIGENCE">尽职调查不足</Option>
              <Option value="OTHER">其他原因（请在备注中说明）</Option>
            </Select>
          </Form.Item>
          <Form.Item name="notes" label="详细审查备注">
            <TextArea rows={3} placeholder="请详细说明拒绝依据..." />
          </Form.Item>
          <Form.Item name="blacklistSupplier" valuePropName="checked">
            <Checkbox>同时将该供应商加入黑名单（后续交易自动拦截）</Checkbox>
          </Form.Item>
          <Form.Item className="!mb-0 text-right">
            <Space>
              <Button onClick={() => setRejectOpen(false)}>取消</Button>
              <Button type="primary" danger icon={<CloseCircleOutlined />} htmlType="submit" loading={actionLoading}>确认拒绝</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 升级模态 */}
      <Modal title={<Space><RiseOutlined className="text-orange-500" />升级至合规总监</Space>}
        open={escalateOpen} onCancel={() => setEscalateOpen(false)} footer={null} destroyOnClose>
        <Alert type="warning" showIcon className="mb-4"
          message="请确认升级此工单"
          description="升级后工单将自动分配给合规总监，并发送紧急通知。升级后原审查员仍可查看但无权决策。" />
        <Form form={escalateForm} layout="vertical" onFinish={doEscalate}>
          <Form.Item name="reason" label="升级理由" rules={[{ required: true, message: '请输入升级理由' }]}>
            <TextArea rows={4} placeholder="请详细说明需要总监介入的原因，如：特别复杂的制裁匹配、涉及重大金额、需要跨部门协调等" />
          </Form.Item>
          <Form.Item className="!mb-0 text-right">
            <Space>
              <Button onClick={() => setEscalateOpen(false)}>取消</Button>
              <Button type="primary" icon={<RiseOutlined />} htmlType="submit" loading={actionLoading}>确认升级</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 分配模态 */}
      <Modal title={<Space><TeamOutlined className="text-purple-500" />分配审查员</Space>}
        open={assignOpen} onCancel={() => setAssignOpen(false)} footer={null} destroyOnClose>
        <Form form={assignForm} layout="vertical" onFinish={doAssign}>
          <Form.Item name="assignTo" label="选择审查员" rules={[{ required: true, message: '请选择审查员' }]}>
            <Select placeholder="请选择要分配的审查员" showSearch optionFilterProp="label">
              {officers.length ? officers.map((o) => (
                <Option key={o._id} value={o._id} label={`${o.name} (${o.role})`}>
                  <Row align="middle" gutter={[8, 0]}>
                    <Col><Avatar size="small" icon={<UserOutlined />} /></Col>
                    <Col flex="auto">
                      <div className="font-medium">{o.name}</div>
                      <div className="text-xs text-gray-500">{o.role} · 进行中 {o.activeCount || 0} 单 · 已完成 {o.completedCount || 0} 单</div>
                    </Col>
                  </Row>
                </Option>
              )) : (
                <Option value="" disabled>暂无可用审查员数据</Option>
              )}
            </Select>
          </Form.Item>
          <Form.Item className="!mb-0 text-right">
            <Space>
              <Button onClick={() => setAssignOpen(false)}>取消</Button>
              <Button type="primary" icon={<SendOutlined />} htmlType="submit" loading={actionLoading}>确认分配</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ReviewDetail;
