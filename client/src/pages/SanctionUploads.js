import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, App, Typography, Progress, Empty, Descriptions, Drawer, Alert } from 'antd';
import { ReloadOutlined, EyeOutlined, FileTextOutlined, DownloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../services/api';
import { formatNumber } from '../store';

const { Text } = Typography;

export default function SanctionUploads() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadData = async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const res = await api.sanctions.uploadHistory({ page, pageSize });
      setData(res.items || []);
      setTotal(res.total);
      setPagination({ current: page, pageSize });
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const openDetail = async (uploadId) => {
    setDetail(uploadId);
    setDetailLoading(true);
    try {
      const res = await api.sanctions.getUpload(uploadId);
      setDetail(res);
    } catch { message.error('获取详情失败'); }
    finally { setDetailLoading(false); }
  };

  const listNames = {
    'OFAC-SDN': 'red', 'OFAC-NSMBS': 'orange', 'EU-CON': 'blue',
    'UN-SEC': 'purple', 'UK-CONS': 'cyan', 'HMT': 'geekblue', 'CUSTOM': 'magenta',
  };
  const procColors = { COMPLETED: 'green', PARTIAL: 'orange', FAILED: 'red', PENDING: 'default', PROCESSING: 'processing' };
  const valColors = { VALID: 'green', INVALID: 'red', PENDING: 'default', VALIDATING: 'processing' };

  const columns = [
    {
      title: '上传ID', dataIndex: 'uploadId', width: 180,
      render: (v) => <a onClick={() => openDetail(v)} style={{ fontFamily: 'monospace', fontWeight: 500 }}>{v}</a>,
    },
    { title: '原始文件名', dataIndex: 'originalFileName', width: 220, ellipsis: true, render: (v, r) => <Space><FileTextOutlined /><Text code>{v || r.fileName}</Text></Space> },
    {
      title: '名单来源', dataIndex: 'listName', width: 120,
      render: v => <Tag color={listNames[v]} style={{ fontWeight: 600 }}>{v}</Tag>,
    },
    {
      title: '处理状态', dataIndex: 'processingStatus', width: 100,
      render: v => <Tag color={procColors[v]} style={{ padding: '2px 10px' }}>{v}</Tag>,
    },
    {
      title: '校验状态', dataIndex: 'validationStatus', width: 100,
      render: v => <Tag color={valColors[v]}>{v}</Tag>,
    },
    { title: '总行数', dataIndex: ['statistics', 'totalRows'], width: 80, render: v => formatNumber(v || 0) },
    { title: '新增', dataIndex: ['statistics', 'inserted'], width: 80, render: v => <Text type="success">{formatNumber(v || 0)}</Text> },
    { title: '更新', dataIndex: ['statistics', 'updated'], width: 80, render: v => <Text type="warning">{formatNumber(v || 0)}</Text> },
    { title: '失效', dataIndex: ['statistics', 'deactivated'], width: 80, render: v => <Text type="danger">{formatNumber(v || 0)}</Text> },
    { title: '错误', dataIndex: ['statistics', 'invalidRows'], width: 80, render: v => v > 0 ? <Text type="danger">{v}</Text> : v },
    { title: '上传人', dataIndex: 'uploadedBy', width: 120 },
    { title: '上传时间', dataIndex: 'uploadedAt', width: 160, render: v => dayjs(v).format('YYYY-MM-DD HH:mm:ss'), defaultSortOrder: 'descend', sorter: (a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt) },
    {
      title: '操作', width: 100, fixed: 'right',
      render: (_, r) => (
        <Space>
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(r.uploadId)}>详情</Button>
          {r.filePath && <a href={`/${r.filePath}`} download><Button size="small" type="link" icon={<DownloadOutlined />}>下载</Button></a>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        style={{ borderRadius: 10, marginBottom: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
        bodyStyle={{ padding: '12px 16px' }}
        title={<Space><SafetyCertificateOutlined />制裁名单上传历史</Space>}
        extra={<Button icon={<ReloadOutlined />} onClick={() => loadData(pagination.current, pagination.pageSize)}>刷新</Button>}
      >
        <Table
          columns={columns}
          dataSource={data}
          rowKey="uploadId"
          loading={loading}
          size="middle"
          scroll={{ x: 1500 }}
          pagination={{
            ...pagination,
            total,
            showSizeChanger: true,
            showTotal: t => `共 ${formatNumber(t)} 条`,
            onChange: (p, s) => loadData(p, s),
          }}
        />
      </Card>

      <Drawer
        title="上传详情"
        open={!!detail}
        onClose={() => setDetail(null)}
        width={680}
        loading={detailLoading}
      >
        {detail && typeof detail === 'object' && (
          <div>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="上传ID">{detail.uploadId}</Descriptions.Item>
              <Descriptions.Item label="名单来源"><Tag color={listNames[detail.listName]}>{detail.listName}</Tag></Descriptions.Item>
              <Descriptions.Item label="文件名" span={2}>{detail.originalFileName || detail.fileName}</Descriptions.Item>
              <Descriptions.Item label="处理状态"><Tag color={procColors[detail.processingStatus]}>{detail.processingStatus}</Tag></Descriptions.Item>
              <Descriptions.Item label="校验状态"><Tag color={valColors[detail.validationStatus]}>{detail.validationStatus}</Tag></Descriptions.Item>
              <Descriptions.Item label="上传人">{detail.uploadedBy}</Descriptions.Item>
              <Descriptions.Item label="上传时间">{dayjs(detail.uploadedAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
              <Descriptions.Item label="处理时间">{detail.processedAt ? dayjs(detail.processedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}</Descriptions.Item>
              <Descriptions.Item label="文件类型">{detail.fileType}</Descriptions.Item>
              <Descriptions.Item label="文件大小">{(detail.fileSize / 1024).toFixed(2)} KB</Descriptions.Item>
              <Descriptions.Item label="更新模式">{detail.replaceExisting ? <Tag color="red">全量替换</Tag> : <Tag color="green">增量更新</Tag>}</Descriptions.Item>
            </Descriptions>

            <Card type="inner" title="处理统计" style={{ marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                {[
                  { l: '总行数', v: detail.statistics?.totalRows, c: '#1677ff' },
                  { l: '合法行数', v: detail.statistics?.validRows, c: '#52c41a' },
                  { l: '非法行数', v: detail.statistics?.invalidRows, c: '#ff4d4f' },
                  { l: '新增条目', v: detail.statistics?.inserted, c: '#52c41a' },
                  { l: '更新条目', v: detail.statistics?.updated, c: '#faad14' },
                  { l: '失效条目', v: detail.statistics?.deactivated, c: '#8c8c8c' },
                  { l: '重复条目', v: detail.statistics?.duplicates, c: '#722ed1' },
                  { l: '跳过行数', v: detail.statistics?.skippedRows, c: '#eb2f96' },
                ].map((s, i) => (
                  <div key={i} style={{ padding: 12, borderRadius: 8, background: `${s.c}10`, textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.c }}>{formatNumber(s.v || 0)}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </Card>

            {detail.validationErrors?.length > 0 && (
              <Card type="inner" title={`校验错误 (${detail.validationErrors.length})`} style={{ marginBottom: 12 }}>
                {detail.errorMessage && <Alert type="error" showIcon message={detail.errorMessage} style={{ marginBottom: 10 }} />}
                <div style={{ maxHeight: 240, overflow: 'auto' }}>
                  {detail.validationErrors.slice(0, 100).map((e, i) => (
                    <div key={i} style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                      <Text strong type="danger">行{e.row}</Text>
                      {e.column && ` · 列: ${e.column}`}
                      {e.code && ` · [${e.code}]`}
                      <Text type="secondary"> - {e.message}</Text>
                    </div>
                  ))}
                  {detail.validationErrors.length > 100 && <Text type="secondary" style={{ padding: 8 }}>还有 {detail.validationErrors.length - 100} 条错误未显示...</Text>}
                </div>
              </Card>
            )}

            {detail.validationWarnings?.length > 0 && (
              <Card type="inner" title={`校验警告 (${detail.validationWarnings.length})`} style={{ marginBottom: 12 }}>
                <div style={{ maxHeight: 180, overflow: 'auto' }}>
                  {detail.validationWarnings.slice(0, 50).map((w, i) => (
                    <div key={i} style={{ padding: '4px 8px', fontSize: 12 }}>
                      <Text type="warning">行{w.row} · 列{w.column}: </Text>
                      {w.message}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {detail.notes && <Card type="inner" title="备注"><Paragraph>{detail.notes}</Paragraph></Card>}
          </div>
        )}
      </Drawer>
    </div>
  );
}
