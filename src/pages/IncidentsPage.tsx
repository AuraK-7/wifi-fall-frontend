import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Row,
  Col,
  Card,
  Statistic,
  Table,
  Tag,
  Typography,
  Button,
  Space,
  Select,
  Input,
  App,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  SearchOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../store';
import { useIncidentStore, useIncidentOps } from '../hooks/useIncidentStore';
import IncidentDrawer from '../components/incidents/IncidentDrawer';
import { getThemeColors } from '../styles/tokens';
import type { IncidentView } from '../types/incident';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

function getActivityLabel(label: string) {
  const map: Record<string, string> = {
    fall: '跌倒', non_fall: '非跌倒', walking: '行走', sitting: '坐姿', lying: '躺卧',
  };
  return map[label] ?? label;
}

function formatMinutesSince(ts: number) {
  return Math.max(1, Math.floor((Date.now() - ts) / 60_000));
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN');
}

export default function IncidentsPage() {
  const { notification } = App.useApp();
  const darkMode = useAppStore((s) => s.darkMode);
  const c = getThemeColors(darkMode);
  const incidents = useAppStore((s) => s.incidents);
  const alertSummary = useAppStore((s) => s.alertSummary);
  const incidentsLoading = useAppStore((s) => s.incidentsLoading);
  const incidentsError = useAppStore((s) => s.incidentsError);
  const selectedIncidentId = useAppStore((s) => s.selectedIncidentId);
  const setSelectedIncidentId = useAppStore((s) => s.setSelectedIncidentId);
  const isOperatingId = useAppStore((s) => s.isOperatingId);

  const { refreshIncidents } = useIncidentStore();
  const { acknowledgeIncident, resolveIncident } = useIncidentOps();

  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roomFilter, setRoomFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());

  const roomOptions = useMemo(
    () => Array.from(new Set(incidents.map((i) => i.room).filter(Boolean))).sort(),
    [incidents],
  );

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      if (severityFilter !== 'all' && inc.severity !== severityFilter) return false;
      if (statusFilter !== 'all' && inc.status !== statusFilter) return false;
      if (roomFilter !== 'all' && inc.room !== roomFilter) return false;
      if (searchQuery.trim()) {
        const kw = searchQuery.trim().toLowerCase();
        return (
          inc.room.toLowerCase().includes(kw) ||
          inc.deviceId.toLowerCase().includes(kw) ||
          inc.predictedLabel.toLowerCase().includes(kw)
        );
      }
      return true;
    });
  }, [incidents, severityFilter, statusFilter, roomFilter, searchQuery]);

  const selectedIncident = useMemo(() => {
    if (!selectedIncidentId) return null;
    return incidents.find((i) => i.id === selectedIncidentId) ?? null;
  }, [incidents, selectedIncidentId]);

  // Error notification
  useEffect(() => {
    if (incidentsError) {
      notification.error({ title: '告警加载错误', description: incidentsError, placement: 'bottomRight' });
    }
  }, [incidentsError]);

  const handleAcknowledge = useCallback(
    (incident: IncidentView) => {
      acknowledgeIncident(incident.id);
      setAcknowledgedIds((prev) => new Set(prev).add(incident.id));
      notification.success({
        message: '事件已确认',
        description: `${incident.title} 已标记为已确认`,
        placement: 'bottomRight',
      });
      // Clear flash after animation
      setTimeout(() => {
        setAcknowledgedIds((prev) => {
          const next = new Set(prev);
          next.delete(incident.id);
          return next;
        });
      }, 1600);
    },
    [acknowledgeIncident],
  );

  const handleResolve = useCallback(
    (incident: IncidentView) => {
      resolveIncident(incident);
      notification.success({
        message: '事件已解决',
        description: `${incident.title} 已闭环`,
        placement: 'bottomRight',
      });
    },
    [resolveIncident],
  );

  const columns: ColumnsType<IncidentView> = [
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => {
        const color = status === 'triggered' ? 'red' : status === 'acknowledged' ? 'orange' : 'green';
        const label = status === 'triggered' ? '已触发' : status === 'acknowledged' ? '已确认' : '已解决';
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: '事件',
      key: 'event',
      width: 200,
      render: (_: unknown, record: IncidentView) => (
        <div>
          <Text strong style={{ color: c.text.primary, fontSize: 13 }}>
            {getActivityLabel(record.predictedLabel)} @ {record.room}
          </Text>
          <br />
          <Text style={{ color: c.text.muted, fontSize: 11 }}>
            {record.reason?.slice(0, 50) ?? '--'}
          </Text>
        </div>
      ),
    },
    {
      title: '等级',
      dataIndex: 'severity',
      key: 'severity',
      width: 70,
      render: (s: string) => (
        <Tag color={s === 'high' ? 'red' : s === 'medium' ? 'orange' : 'green'}>{s.toUpperCase()}</Tag>
      ),
    },
    {
      title: '房间',
      dataIndex: 'room',
      key: 'room',
      width: 100,
    },
    {
      title: '设备',
      dataIndex: 'deviceId',
      key: 'deviceId',
      width: 120,
      render: (id: string) => (
        <Text style={{ color: c.text.muted, fontSize: 12, fontFamily: 'monospace' }}>{id}</Text>
      ),
    },
    {
      title: '首次触发',
      dataIndex: 'firstSeen',
      key: 'firstSeen',
      width: 150,
      render: (ts: number) => formatTime(ts),
    },
    {
      title: '最近触发',
      dataIndex: 'lastSeen',
      key: 'lastSeen',
      width: 100,
      render: (ts: number) => `${formatMinutesSince(ts)} 分钟前`,
    },
    {
      title: '次数',
      dataIndex: 'eventCount',
      key: 'count',
      width: 60,
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 90,
      render: (confidence: number) => (
        <span style={{ color: confidence > 0.85 ? c.status.danger : c.text.primary }}>
          {(confidence * 100).toFixed(0)}%
        </span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_: unknown, record: IncidentView) => (
        <Space size="small">
          {record.status === 'triggered' && (
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              loading={isOperatingId === record.id}
              onClick={(e) => {
                e.stopPropagation();
                handleAcknowledge(record);
              }}
            >
              确认
            </Button>
          )}
          {(record.status === 'triggered' || record.status === 'acknowledged') && (
            <Button
              size="small"
              danger
              icon={<CloseOutlined />}
              loading={isOperatingId === record.id}
              onClick={(e) => {
                e.stopPropagation();
                handleResolve(record);
              }}
            >
              解决
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* ── Stats ───────────────────────────────────────────────── */}
      <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
        <Col xs={8} sm={4}>
          <Card size="small">
            <Statistic title="总事件" value={alertSummary.total} valueStyle={{ fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={8} sm={4}>
          <Card size="small">
            <Statistic
              title="未处理"
              value={alertSummary.unhandled}
              valueStyle={{ color: alertSummary.unhandled > 0 ? c.status.danger : c.status.success, fontSize: 22 }}
            />
          </Card>
        </Col>
        <Col xs={8} sm={4}>
          <Card size="small">
            <Statistic title="已处理" value={alertSummary.handled} valueStyle={{ color: c.status.success, fontSize: 22 }} />
          </Card>
        </Col>
      </Row>

      {/* ── Filters ─────────────────────────────────────────────── */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索房间/设备/标签..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: 220 }}
            allowClear
          />
          <Select
            value={severityFilter}
            onChange={setSeverityFilter}
            style={{ width: 100 }}
            options={[
              { value: 'all', label: '全部等级' },
              { value: 'high', label: '高' },
              { value: 'medium', label: '中' },
              { value: 'low', label: '低' },
            ]}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 100 }}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'triggered', label: '已触发' },
              { value: 'acknowledged', label: '已确认' },
              { value: 'resolved', label: '已解决' },
            ]}
          />
          <Select
            value={roomFilter}
            onChange={setRoomFilter}
            style={{ width: 140 }}
            options={[
              { value: 'all', label: '全部房间' },
              ...roomOptions.map((r) => ({ value: r, label: r })),
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={refreshIncidents} loading={incidentsLoading}>
            刷新
          </Button>
        </Space>
      </Card>

      {/* ── Table ───────────────────────────────────────────────── */}
      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table<IncidentView>
          columns={columns}
          dataSource={filteredIncidents}
          rowKey="id"
          loading={incidentsLoading}
          size="small"
          scroll={{ x: 1200 }}
          pagination={{ pageSize: 15, size: 'small', showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          locale={{ emptyText: '暂无告警事件' }}
          rowClassName={(record) => {
            const classes: string[] = [];
            if (record.id === selectedIncidentId) classes.push('ant-table-row-selected');
            if (acknowledgedIds.has(record.id)) classes.push('row-acknowledged');
            if (record.status === 'triggered') classes.push('');
            return classes.join(' ');
          }}
          onRow={(record) => ({
            onClick: () => setSelectedIncidentId(record.id),
            style: { cursor: 'pointer' },
          })}
          expandable={{
            rowExpandable: (record) => record.alerts.length > 1,
            expandedRowRender: (record) => (
              <div style={{ padding: '8px 16px' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  聚合 {record.alerts.length} 条子告警
                </Text>
                {record.alerts.slice(0, 10).map((alert) => (
                  <div key={alert.event_id} style={{ marginTop: 4, fontSize: 12, color: c.text.muted }}>
                    {formatTime(typeof alert.timestamp === 'string' ? Date.parse(alert.timestamp) : alert.timestamp * 1000)}
                    {' — '}
                    置信度 {(alert.confidence * 100).toFixed(0)}%
                    {' — '}
                    {alert.reason ?? '--'}
                  </div>
                ))}
                {record.alerts.length > 10 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    ... 还有 {record.alerts.length - 10} 条
                  </Text>
                )}
              </div>
            ),
          }}
        />
      </Card>

      {/* ── Drawer ──────────────────────────────────────────────── */}
      <IncidentDrawer incident={selectedIncident} />
    </div>
  );
}
