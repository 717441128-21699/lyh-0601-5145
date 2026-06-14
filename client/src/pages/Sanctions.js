import React, { useState, useEffect } from 'react';
import {
  Card, Table, Tag, Input, Button, Space, Form, Select, Modal, Drawer,
  App, Descriptions, Upload, Progress, Typography, Row, Col, Statistic,
  Empty, Tooltip, Divider, Alert as AntAlert, message as AntMessage,
} from 'antd';
import {
  SearchOutlined,
  UploadOutlined,
  PlusOutlined,
  DeleteOutlined,
  EyeOutlined,
  FilterOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
  DatabaseOutlined,
  TeamOutlined,
  FlagOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  RocketOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { formatNumber, RISK_COLORS } from '../store';

const { Option } = Select;
const { Text, Title, Paragraph } = Typography;

export default function Sanctions() {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50 });
  const [filters, setFilters] = useState({ isActive: 'true' });
  const [config, setConfig] = useState({ validLists: [], validEntityTypes: [] });

  const [uploadModal, setUploadModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadForm] = Form.useForm();

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [addModal, setAddModal] = useState(false);
  const [addForm] = Form.useForm();

  const [stats, setStats] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const c = await api.sanctions.config();
        setConfig(c);
      } catch { /* ignore */ }
    })();
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const s = await api.sanctions.stats();
      setStats(s);
    } catch { /* ignore */ }
  };

  const loadData = async (page = 1, pageSize = 50, extra = {}) => {
    setLoading(true);
    try {
      const res = await api.sanctions.list({
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

  useEffect(() => { loadData(1, 50); }, []);

  const openDetail = async (entryId) => {
    setDetail(entryId);
    setDetailLoading(true);
    try {
      const res = await api.sanctions.get(entryId);
      setDetail(res);
    } catch {
      message.error('获取详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleUpload = async () => {
    const values = await uploadForm.validateFields();
    if (!values.file || values.file.length === 0) {
      message.error('请上传文件');
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', values.file[0].originFileObj);
      formData.append('listName', values.listName);
      formData.append('replaceExisting', values.replaceExisting ? 'true' : 'false');
      if (values.effectiveDate) formData.append('effectiveDate', values.effectiveDate.toISOString());

      const res = await api.sanctions.upload(formData, (p) => setUploadProgress(p));
      message.success(`上传完成: 新增 ${res.upload.statistics.inserted}, 更新 ${res.upload.statistics.updated}`);
      setUploadModal(false);
      uploadForm.resetFields();
      loadData(1, pagination.pageSize);
      loadStats();
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleAdd = async () => {
    const values = await addForm.validateFields();
    try {
      await api.sanctions.create(values);
      message.success('添加成功');
      setAddModal(false);
      addForm.resetFields();
      loadData(1, pagination.pageSize);
      loadStats();
    } catch { /* handled */ }
  };

  const deactivate = (record) => {
    modal.confirm({
      title: '确认失效该制裁条目?',
      content: `${record.listName} - ${record.name} (${record.entryId})`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.sanctions.delete(record.entryId);
          message.success('已失效');
          loadData(pagination.current, pagination.pageSize);
          loadStats();
          setDetail(null);
        } catch { /* handled */ }
      },
    });
  };

  const columns = [
    {
      title: '条目ID', dataIndex: 'entryId', width: 160,
      render: (v) => <a onClick={() => openDetail(v)} style={{ fontFamily: 'monospace', fontWeight: 500 }}>{v}</a>,
    },
    {
      title: '名单来源', dataIndex: 'listName', width: 120,
      render: (v) => {
        const colors = {
          'OFAC-SDN': 'red', 'OFAC-NSMBS': 'orange', 'EU-CON': 'blue',
          'UN-SEC': 'purple', 'UK-CONS': 'cyan', 'HMT': 'geekblue', 'CUSTOM': 'magenta',
        };
        return <Tag color={colors[v]} style={{ fontWeight: 600 }}>{v}</Tag>;
      },
      filters: config.validLists.map(l => ({ text: l, value: l })),
      onFilter: (v, r) => r.listName === v,
    },
    {
      title: '实体名称', dataIndex: 'name', width: 240,
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{v}</div>
          {r.alternateNames?.length > 0 && (
            <Text type="secondary" style={{ fontSize: 11 }}>别名: {r.alternateNames.slice(0, 2).join(', ')}{r.alternateNames.length > 2 ? '...' : ''}</Text>
          )}
        </div>
      ),
    },
    {
      title: '类型', dataIndex: 'entityType', width: 110,
      render: (v) => {
        const icons = {
          INDIVIDUAL: '👤', COMPANY: '🏢', ORGANIZATION: '🏛️',
          VESSEL: '🚢', AIRCRAFT: '✈️', GOODS: '📦', COUNTRY: '🌍',
        };
        return <span>{icons[v]} {v}</span>;
      },
      filters: config.validEntityTypes.map(t => ({ text: t, value: t })),
      onFilter: (v, r) => r.entityType === v,
    },
    {
      title: '关联国家', dataIndex: 'countries', width: 180,
      render: (v) => v?.length > 0
        ? <Space size={4} wrap>{v.slice(0, 4).map(c => <Tag key={c} color="blue">{c}</Tag>)}{v.length > 4 && <Tag>+{v.length - 4}</Tag>}</Space>
        : '-',
    },
    {
      title: 'HS编码', dataIndex: 'hsCodes', width: 180,
      render: (v) => v?.length > 0
        ? <Space size={4} wrap>{v.slice(0, 3).map(h => <Tag key={h} color="orange">{h}</Tag>)}{v.length > 3 && <Tag>+{v.length - 3}</Tag>}</Space>
        : '-',
    },
    {
      title: '状态', dataIndex: 'isActive', width: 90,
      render: v => v
        ? <Tag color="green" icon={<CheckCircleOutlined />}>生效中</Tag>
        : <Tag color="default" icon={<CloseCircleOutlined />}>已失效</Tag>,
    },
    {
      title: '更新时间', dataIndex: 'updatedAt', width: 150,
      render: v => dayjs(v).format('YYYY-MM-DD HH:mm'),
      defaultSortOrder: 'descend',
      sorter: (a, b) => new Date(a.updatedAt) - new Date(b.updatedAt),
    },
    {
      title: '操作', width: 160, fixed: 'right',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(r.entryId)}>详情</Button>
          <Button size="small" type="link" icon={<FileSearchOutlined />} onClick={async () => {
            try {
              const res = await api.sanctions.searchTransactions(r.entryId);
              modal.info({
                title: `关联交易 - ${res.entry.name}`,
                width: 900,
                content: (
                  <div>
                    <AntAlert message={`共匹配 ${res.transactionCount} 笔历史交易`} type="info" showIcon style={{ marginBottom: 12 }} />
                    <Table
                      size="small"
                      pagination={{ pageSize: 10 }}
                      dataSource={res.transactions}
                      rowKey="_id"
                      columns={[
                        { title: '交易编号', dataIndex: 'transactionId', width: 160, render: v => <a onClick={() => navigate(`/transactions/${v}`)}>{v}</a> },
                        { title: '供应商', dataIndex: 'supplierName', width: 180 },
                        { title: 'HS编码', dataIndex: 'hsCode', width: 120 },
                        { title: '风险等级', dataIndex: 'riskLevel', width: 100, render: v => <Tag color={RISK_COLORS[v]}>{v}</Tag> },
                        { title: '金额', dataIndex: 'totalAmount', render: v => v?.toLocaleString() },
                        { title: '状态', dataIndex: 'status', width: 100 },
                        { title: '日期', dataIndex: 'orderDate', render: v => dayjs(v).format('YYYY-MM-DD'), width: 110 },
                      ]}
                    />
                  </div>
                ),
              });
            } catch { message.error('查询失败'); }
          }}>关联交易</Button>
          {r.isActive && (
            <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => deactivate(r)}>失效</Button>
          )}
        </Space>
      ),
    },
  ];

  const statCards = [
    { title: '生效条目', value: stats.totalActive || 0, color: '#52c41a', icon: <DatabaseOutlined /> },
    { title: '已失效', value: stats.totalInactive || 0, color: '#999', icon: <CloseCircleOutlined /> },
  ];

  return (
    <div>
      <Card
        style={{ borderRadius: 10, marginBottom: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <Space wrap size={[12, 8]}>
          <Space.Compact>
            <Input
              allowClear
              placeholder="搜索名称/编号/ID..."
              style={{ width: 260 }}
              prefix={<SearchOutlined />}
              onPressEnter={(e) => {
                setFilters(f => ({ ...f, search: e.target.value }));
                loadData(1, pagination.pageSize, { search: e.target.value });
              }}
            />
          </Space.Compact>
          <Select
            allowClear
            placeholder="名单来源"
            style={{ width: 160 }}
            mode="multiple"
            maxTagCount={2}
            value={filters.listName ? (Array.isArray(filters.listName) ? filters.listName : [filters.listName]) : undefined}
            onChange={v => setFilters(f => ({ ...f, listName: v }))}
          >
            {config.validLists.map(l => <Option key={l} value={l}>{l}</Option>)}
          </Select>
          <Select
            allowClear
            placeholder="实体类型"
            style={{ width: 150 }}
            mode="multiple"
            maxTagCount={2}
            value={filters.entityType ? (Array.isArray(filters.entityType) ? filters.entityType : [filters.entityType]) : undefined}
            onChange={v => setFilters(f => ({ ...f, entityType: v }))}
          >
            {config.validEntityTypes.map(t => <Option key={t} value={t}>{t}</Option>)}
          </Select>
          <Input
            allowClear
            placeholder="国家代码"
            style={{ width: 120 }}
            prefix={<FlagOutlined />}
            onChange={e => {
              setFilters(f => ({ ...f, country: e.target.value }));
              if (!e.target.value) loadData(1, pagination.pageSize);
            }}
            onPressEnter={(e) => loadData(1, pagination.pageSize, { country: e.target.value })}
          />
          <Select
            placeholder="启用状态"
            style={{ width: 120 }}
            value={filters.isActive}
            onChange={v => setFilters(f => ({ ...f, isActive: v }))}
          >
            <Option value="true">仅生效</Option>
            <Option value="false">仅失效</Option>
            <Option value={undefined}>全部</Option>
          </Select>
          <Space>
            <Button type="primary" icon={<FilterOutlined />} onClick={() => loadData(1, pagination.pageSize)}>查询</Button>
            <Button icon={<ReloadOutlined />} onClick={() => { setFilters({ isActive: 'true' }); loadData(1, 50); loadStats(); }}>重置</Button>
            <Divider type="vertical" />
            <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadModal(true)}>上传名单</Button>
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => setAddModal(true)}>手工添加</Button>
            <Link to="/sanctions/uploads">
              <Button icon={<FileSearchOutlined />}>上传记录</Button>
            </Link>
          </Space>
        </Space>
      </Card>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        {statCards.map((c, i) => (
          <Col xs={12} md={6} key={i}>
            <Card style={{ borderRadius: 10, border: 'none' }} bodyStyle={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{c.title}</Text>
                  <div style={{ fontSize: 22, fontWeight: 700, color: c.color, marginTop: 4 }}>
                    {formatNumber(c.value)}
                  </div>
                </div>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${c.color}15`, color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  {c.icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
        {stats.byListAndType?.slice(0, 6).map((item, i) => (
          <Col xs={12} md={6} lg={4} key={i}>
            <Card size="small" style={{ borderRadius: 10, border: 'none' }}>
              <Statistic
                title={<Text style={{ fontSize: 12 }}>{item._id.list}</Text>}
                value={item.count}
                valueStyle={{ fontSize: 16 }}
                suffix={<Tag style={{ fontSize: 11 }} color="blue">{item._id.type}</Tag>}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card style={{ borderRadius: 10, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }} bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="entryId"
          loading={loading}
          size="middle"
          scroll={{ x: 1600 }}
          pagination={{
            ...pagination,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: t => `共 ${formatNumber(t)} 条`,
            onChange: (p, s) => loadData(p, s),
          }}
        />
      </Card>

      <Modal
        title={<Space><UploadOutlined />上传制裁名单</Space>}
        open={uploadModal}
        onCancel={() => { setUploadModal(false); uploadForm.resetFields(); }}
        onOk={handleUpload}
        confirmLoading={uploading}
        okText="开始上传"
        width={620}
      >
        {uploading && uploadProgress > 0 && (
          <Progress percent={uploadProgress} status={uploadProgress < 100 ? 'active' : 'success'} style={{ marginBottom: 16 }} />
        )}
        <AntAlert
          type="info"
          showIcon
          message="支持格式"
          description="CSV / XLSX / XLS / JSON，文件最大50MB。建议字段：entryId(编号,必填), name(名称,必填), entityType(类型,必填), listName(来源,从下拉选择), countries(国家), hsCodes(HS编码), alternateNames(别名), designationDate(指定日期)"
          style={{ marginBottom: 16 }}
        />
        <Form form={uploadForm} layout="vertical">
          <Form.Item
            name="listName"
            label="制裁名单来源"
            rules={[{ required: true, message: '请选择名单来源' }]}
          >
            <Select placeholder="选择名单来源">
              {config.validLists.map(l => <Option key={l} value={l}>{l}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item
            name="file"
            label="上传文件"
            valuePropName="fileList"
            getValueFromEvent={e => (Array.isArray(e) ? e : e?.fileList)}
            rules={[{ required: true, message: '请上传文件' }]}
          >
            <Upload.Dragger
              beforeUpload={() => false}
              maxCount={1}
              accept=".csv,.xlsx,.xls,.json"
              multiple={false}
            >
              <p className="ant-upload-drag-icon"><RocketOutlined /></p>
              <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
              <p className="ant-upload-hint">支持 CSV, Excel (XLSX/XLS), JSON 格式</p>
            </Upload.Dragger>
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="replaceExisting"
                label="处理模式"
                valuePropName="checked"
                tooltip="勾选后先将该名单所有条目置为失效，再导入新数据"
              >
                <Select
                  options={[
                    { value: false, label: '增量更新（推荐）' },
                    { value: true, label: '全量替换（先清空该名单）' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="effectiveDate" label="生效日期">
                <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={<Space><PlusOutlined />手工添加制裁条目</Space>}
        open={addModal}
        onCancel={() => { setAddModal(false); addForm.resetFields(); }}
        onOk={handleAdd}
        okText="添加"
        width={700}
      >
        <Form form={addForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="listName" label="名单来源" rules={[{ required: true }]}>
                <Select placeholder="选择">
                  {config.validLists.map(l => <Option key={l} value={l}>{l}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="entityType" label="实体类型" rules={[{ required: true }]}>
                <Select placeholder="选择">
                  {config.validEntityTypes.map(t => <Option key={t} value={t}>{t}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="name" label="实体名称" rules={[{ required: true }]}>
            <Input placeholder="如：North Korea Foreign Trade Bank" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="entryId" label="条目编号 (留空自动生成)">
                <Input placeholder="自定义编号或留空" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="programs" label="制裁项目/方案">
                <Select mode="tags" placeholder="如: DPRK, IRAN 等" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="countries" label="关联国家">
                <Select mode="tags" placeholder="输入国家代码如：KP, IR" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="hsCodes" label="管制HS编码">
                <Select mode="tags" placeholder="如: 8471.30" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="alternateNames" label="别名/曾用名">
            <Select mode="tags" placeholder="输入别名" />
          </Form.Item>
          <Form.Item name="remarks" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={<Space><InfoCircleOutlined style={{ color: '#1677ff' }} />制裁条目详情<div style={{ fontSize: 13, fontWeight: 400 }}><Text code>{detail?.entryId || ''}</Text></div></Space>}
        open={!!detail}
        onClose={() => setDetail(null)}
        width={720}
        loading={detailLoading}
        extra={detail?.isActive && (
          <Space>
            <Button danger icon={<DeleteOutlined />} onClick={() => deactivate(detail)}>设为失效</Button>
          </Space>
        )}
      >
        {detail && (
          <div>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="条目编号">{detail.entryId}</Descriptions.Item>
              <Descriptions.Item label="名单来源">
                <Tag color="blue">{detail.listName}</Tag>
                {detail.listSource && <Tag color="purple" style={{ marginLeft: 4 }}>{detail.listSource}</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="实体类型"><Tag>{detail.entityType}</Tag></Descriptions.Item>
              <Descriptions.Item label="状态">
                {detail.isActive ? <Tag color="green">生效中</Tag> : <Tag>已失效</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="实体名称" span={2}>
                <Title level={4} style={{ margin: 0 }}>{detail.name}</Title>
              </Descriptions.Item>
              {detail.firstName && (
                <>
                  <Descriptions.Item label="名">{detail.firstName}</Descriptions.Item>
                  <Descriptions.Item label="姓">{detail.lastName}</Descriptions.Item>
                </>
              )}
              <Descriptions.Item label="别名" span={2}>
                {detail.alternateNames?.length > 0 ? detail.alternateNames.map(n => <Tag key={n} color="purple">{n}</Tag>) : '-'}
                {detail.aliases?.length > 0 && detail.aliases.map(n => <Tag key={n} color="magenta">{n}</Tag>)}
              </Descriptions.Item>
              <Descriptions.Item label="关联国家" span={2}>
                {detail.countries?.length > 0 ? detail.countries.map(c => <Tag key={c} color="blue">{c}</Tag>) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="国籍">{detail.nationalities?.join(', ') || '-'}</Descriptions.Item>
              <Descriptions.Item label="HS管制编码">
                {detail.hsCodes?.length > 0 ? detail.hsCodes.map(h => <Tag key={h} color="orange">{h}</Tag>) : '-'}
              </Descriptions.Item>
              {detail.vesselImoNumber && (
                <>
                  <Descriptions.Item label="IMO编号">{detail.vesselImoNumber}</Descriptions.Item>
                  <Descriptions.Item label="船名/船旗">{detail.vesselName} · {detail.vesselFlag}</Descriptions.Item>
                </>
              )}
              <Descriptions.Item label="制裁项目" span={2}>
                {detail.programs?.length > 0 ? detail.programs.map(p => <Tag key={p} color="geekblue">{p}</Tag>) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="指定日期">{detail.designationDate ? dayjs(detail.designationDate).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
              <Descriptions.Item label="失效日期">{detail.expirationDate ? dayjs(detail.expirationDate).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
              <Descriptions.Item label="版本">{detail.version || 1}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{dayjs(detail.updatedAt).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>{detail.remarks || '-'}</Descriptions.Item>
              {detail.goodsDescription && (
                <Descriptions.Item label="商品描述" span={2}>{detail.goodsDescription}</Descriptions.Item>
              )}
            </Descriptions>

            {detail.addresses?.length > 0 && (
              <Card type="inner" title="地址信息" size="small" style={{ marginBottom: 12 }}>
                <List
                  size="small"
                  bordered
                  dataSource={detail.addresses}
                  renderItem={(a, i) => (
                    <List.Item key={i}>
                      {a.line1} {a.line2 || ''}，{a.city || ''} {a.state || ''} {a.postalCode || ''} {a.country || ''}
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
