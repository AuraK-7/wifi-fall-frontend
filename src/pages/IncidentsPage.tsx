import { useEffect, useMemo, useState, useCallback } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Typography, Button, Space, Select, Input, App } from 'antd';
import { CheckOutlined, CloseOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAppStore } from '../store';
import { useIncidentStore, useIncidentOps } from '../hooks/useIncidentStore';
import IncidentDrawer from '../components/incidents/IncidentDrawer';
import { getThemeColors, fontFamily } from '../styles/tokens';
import type { IncidentView } from '../types/incident';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

const LABEL_MAP: Record<string, string> = { fall: '跌倒', non_fall: '非跌倒', walking: '行走', sitting: '坐姿', lying: '躺卧' };

function fmtTime(ts: number) { return new Date(ts).toLocaleString('zh-CN'); }
function fmtSince(ts: number) { return Math.max(1, Math.floor((Date.now() - ts) / 60_000)); }

export default function IncidentsPage() {
  const { notification } = App.useApp();
  const dm = useAppStore(s => s.darkMode);
  const c = getThemeColors(dm);
  const incidents = useAppStore(s => s.incidents);
  const alertSummary = useAppStore(s => s.alertSummary);
  const incidentsLoading = useAppStore(s => s.incidentsLoading);
  const incidentsError = useAppStore(s => s.incidentsError);
  const selectedIncidentId = useAppStore(s => s.selectedIncidentId);
  const setSelectedIncidentId = useAppStore(s => s.setSelectedIncidentId);
  const isOperatingId = useAppStore(s => s.isOperatingId);
  const { refreshIncidents } = useIncidentStore();
  const { acknowledgeIncident, resolveIncident } = useIncidentOps();

  const [severityF, setSeverityF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [roomF, setRoomF] = useState('all');
  const [search, setSearch] = useState('');

  const rooms = useMemo(() => [...new Set(incidents.map(i => i.room).filter(Boolean))].sort(), [incidents]);

  const filtered = useMemo(() => incidents.filter(inc => {
    if (severityF !== 'all' && inc.severity !== severityF) return false;
    if (statusF !== 'all' && inc.status !== statusF) return false;
    if (roomF !== 'all' && inc.room !== roomF) return false;
    if (search.trim()) {
      const kw = search.trim().toLowerCase();
      return inc.room.toLowerCase().includes(kw) || inc.deviceId.toLowerCase().includes(kw) || inc.predictedLabel.toLowerCase().includes(kw);
    }
    return true;
  }), [incidents, severityF, statusF, roomF, search]);

  const selected = useMemo(() => selectedIncidentId ? incidents.find(i => i.id === selectedIncidentId) ?? null : null, [incidents, selectedIncidentId]);

  useEffect(() => { if (incidentsError) notification.error({ message: '告警加载错误', description: incidentsError, placement: 'bottomRight' }); }, [incidentsError]);

  const ack = useCallback((inc: IncidentView) => { acknowledgeIncident(inc.id); notification.success({ message: '已确认', placement: 'bottomRight' }); }, [acknowledgeIncident]);
  const resolve = useCallback((inc: IncidentView) => { resolveIncident(inc); notification.success({ message: '已解决', placement: 'bottomRight' }); }, [resolveIncident]);

  const ff = fontFamily.mono;
  const compact = { fontSize: 11, fontFamily: ff };

  const columns: ColumnsType<IncidentView> = [
    { title: '状态', dataIndex: 'status', width: 70, render: (s: string) => <Tag color={s === 'triggered' ? 'red' : s === 'acknowledged' ? 'orange' : 'green'} style={{ fontSize: 10, lineHeight: '16px' }}>{s === 'triggered' ? '触发' : s === 'acknowledged' ? '确认' : '解决'}</Tag> },
    { title: '标签', key: 'label', width: 60, render: (_: unknown, r: IncidentView) => <Text style={compact}>{LABEL_MAP[r.predictedLabel] ?? r.predictedLabel}</Text> },
    { title: '房间', dataIndex: 'room', width: 100, render: (v: string) => <Text style={compact}>{v}</Text> },
    { title: '等级', dataIndex: 'severity', width: 50, render: (s: string) => <Tag color={s === 'high' ? 'red' : s === 'medium' ? 'orange' : 'green'} style={{ fontSize: 10, lineHeight: '16px' }}>{s}</Tag> },
    { title: '设备', dataIndex: 'deviceId', width: 120, render: (v: string) => <Text style={{ ...compact, color: c.text.muted }}>{v}</Text> },
    { title: '首次', dataIndex: 'firstSeen', width: 140, render: (ts: number) => <Text style={compact}>{fmtTime(ts)}</Text> },
    { title: '最近', dataIndex: 'lastSeen', width: 80, render: (ts: number) => <Text style={compact}>{fmtSince(ts)}分前</Text> },
    { title: '置信', dataIndex: 'confidence', width: 55, render: (v: number) => <Text style={{ ...compact, color: v > 0.85 ? c.status.danger : c.text.primary }}>{(v * 100).toFixed(0)}%</Text> },
    {
      title: '操作', key: 'acts', width: 170,
      render: (_: unknown, r: IncidentView) => (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {r.alerts?.[0]?.event_id && (
            <a href={`#/replay?eventId=${r.alerts[0].event_id}`}
              onClick={e => { e.stopPropagation(); window.location.hash = `#/replay?eventId=${r.alerts[0].event_id}`; }}
              style={{ fontSize: 11, color: '#4aa8ff', textDecoration: 'none', fontFamily: ff, whiteSpace: 'nowrap' }}>回放</a>
          )}
          {r.status === 'triggered' && (
            <Button type="link" size="small" icon={<CheckOutlined />} loading={isOperatingId === r.id}
              onClick={e => { e.stopPropagation(); ack(r); }} style={{ fontSize: 11, padding: 0 }}>确认</Button>
          )}
          {(r.status === 'triggered' || r.status === 'acknowledged') && (
            <Button type="link" size="small" danger icon={<CloseOutlined />} loading={isOperatingId === r.id}
              onClick={e => { e.stopPropagation(); resolve(r); }} style={{ fontSize: 11, padding: 0 }}>解决</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ fontFamily: ff }}>
      <Row gutter={[8, 8]} style={{ marginBottom: 8 }}>
        <Col xs={8} sm={4}><Card size="small" styles={{ body: { padding: '6px 12px' } }}><Statistic title="总事件" value={alertSummary.total} valueStyle={{ fontSize: 20 }} /></Card></Col>
        <Col xs={8} sm={4}><Card size="small" styles={{ body: { padding: '6px 12px' } }}><Statistic title="未处理" value={alertSummary.unhandled} valueStyle={{ color: alertSummary.unhandled > 0 ? c.status.danger : c.status.success, fontSize: 20 }} /></Card></Col>
        <Col xs={8} sm={4}><Card size="small" styles={{ body: { padding: '6px 12px' } }}><Statistic title="已处理" value={alertSummary.handled} valueStyle={{ color: c.status.success, fontSize: 20 }} /></Card></Col>
      </Row>

      <Card size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: '6px 12px' } }}>
        <Space wrap size={8}>
          <Input prefix={<SearchOutlined />} placeholder="搜索..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 160 }} size="small" allowClear />
          <Select size="small" value={severityF} onChange={setSeverityF} style={{ width: 80 }} options={[{ value: 'all', label: '等级' }, { value: 'high', label: '高' }, { value: 'medium', label: '中' }, { value: 'low', label: '低' }]} />
          <Select size="small" value={statusF} onChange={setStatusF} style={{ width: 80 }} options={[{ value: 'all', label: '状态' }, { value: 'triggered', label: '触发' }, { value: 'acknowledged', label: '确认' }, { value: 'resolved', label: '解决' }]} />
          <Select size="small" value={roomF} onChange={setRoomF} style={{ width: 120 }} options={[{ value: 'all', label: '房间' }, ...rooms.map(r => ({ value: r, label: r }))]} />
          <Button size="small" icon={<ReloadOutlined />} onClick={refreshIncidents} loading={incidentsLoading} />
        </Space>
      </Card>

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table<IncidentView>
          columns={columns} dataSource={filtered} rowKey="id" loading={incidentsLoading}
          size="small"
          pagination={{ defaultPageSize: 20, pageSizeOptions: ['10', '20', '50', '100'], showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条`, size: 'small' }}
          locale={{ emptyText: '暂无告警事件' }}
          onRow={r => ({ onClick: () => setSelectedIncidentId(r.id), style: { cursor: 'pointer' } })}
        />
      </Card>

      <IncidentDrawer incident={selected} />
    </div>
  );
}
