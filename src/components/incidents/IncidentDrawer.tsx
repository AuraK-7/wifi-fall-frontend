import { useCallback } from 'react';
import {
  Drawer,
  Descriptions,
  Timeline,
  Tag,
  Button,
  Space,
  Input,
  Typography,
  App,
} from 'antd';
import {
  CheckOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../../store';
import { useIncidentOps } from '../../hooks/useIncidentStore';
import type { IncidentView } from '../../types/incident';
import { getThemeColors } from '../../styles/tokens';

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN');
}

function getActionLabel(action: string) {
  const map: Record<string, string> = {
    triggered: '触发告警',
    acknowledged: '已确认',
    escalated: '已升级',
    resolved: '已解决',
    note: '备注',
  };
  return map[action] ?? action;
}

interface IncidentDrawerProps {
  incident: IncidentView | null;
}

export default function IncidentDrawer({ incident }: IncidentDrawerProps) {
  const { notification } = App.useApp();
  const darkMode = useAppStore((s) => s.darkMode);
  const c = getThemeColors(darkMode);
  const drawerOpen = useAppStore((s) => s.drawerOpen);
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);
  const isOperatingId = useAppStore((s) => s.isOperatingId);
  const { acknowledgeIncident, escalateIncident, addIncidentNote, resolveIncident } = useIncidentOps();

  const actionColors: Record<string, string> = {
    triggered: c.status.danger,
    acknowledged: c.status.warning,
    escalated: '#eab54f',
    resolved: c.status.success,
    note: c.status.info,
  };

  const handleAcknowledge = useCallback(() => {
    if (!incident) return;
    acknowledgeIncident(incident.id, '值班员已确认接手');
    notification.success({
      message: '事件已确认',
      description: `${incident.title} 已标记为已确认`,
      placement: 'bottomRight',
    });
  }, [incident, acknowledgeIncident]);

  const handleEscalate = useCallback(() => {
    if (!incident) return;
    escalateIncident(incident.id, '升级到二线处理');
  }, [incident, escalateIncident]);

  const handleResolve = useCallback(() => {
    if (!incident) return;
    resolveIncident(incident);
    notification.success({
      message: '事件已解决',
      description: `${incident.title} 已闭环`,
      placement: 'bottomRight',
    });
  }, [incident, resolveIncident]);

  if (!incident) return null;

  const severityColor = {
    high: 'red',
    medium: 'orange',
    low: 'green',
  }[incident.severity] ?? 'default';

  return (
    <Drawer
      title={
        <Space>
          <WarningOutlined style={{ color: severityColor }} />
          <span>{incident.title}</span>
          <Tag color={severityColor}>{incident.severity.toUpperCase()}</Tag>
        </Space>
      }
      placement="right"
      size="large"
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      styles={{ body: { padding: 16 } }}
    >
      {/* ── Event Metadata ─────────────────────────────────────────── */}
      <Descriptions
        column={2}
        size="small"
        bordered={false}
        style={{ marginBottom: 16 }}
        labelStyle={{ color: c.text.secondary, fontSize: 12 }}
        contentStyle={{ color: c.text.primary, fontSize: 13 }}
      >
        <Descriptions.Item label="记录编号">
          <Typography.Text code>{incident.id.startsWith('REC-') ? incident.id : `REC-${incident.id}`}</Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag
            color={
              incident.status === 'triggered'
                ? 'red'
                : incident.status === 'acknowledged'
                  ? 'orange'
                  : 'green'
            }
          >
            {incident.status === 'triggered' ? '已触发' : incident.status === 'acknowledged' ? '已确认' : '已解决'}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="房间">{incident.room}</Descriptions.Item>
        <Descriptions.Item label="设备">{incident.deviceId}</Descriptions.Item>
        <Descriptions.Item label="预测标签">{incident.predictedLabel}</Descriptions.Item>
        <Descriptions.Item label="置信度峰值">
          <span className="numeric-value" style={{ color: incident.confidence > 0.85 ? c.status.danger : c.status.success, fontWeight: 600 }}>
            {(incident.confidence * 100).toFixed(1)}%
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="首次触发">{formatTime(incident.firstSeen)}</Descriptions.Item>
        <Descriptions.Item label="最近触发">{formatTime(incident.lastSeen)}</Descriptions.Item>
        <Descriptions.Item label="触发次数" span={2}>{incident.eventCount}</Descriptions.Item>
      </Descriptions>

      {/* ── Actions ────────────────────────────────────────────────── */}
      <Space style={{ marginBottom: 16 }}>
        {incident.status === 'triggered' && (
          <Button
            type="primary"
            icon={<CheckOutlined />}
            loading={isOperatingId === incident.id}
            onClick={handleAcknowledge}
          >
            确认事件
          </Button>
        )}
        {(incident.status === 'triggered' || incident.status === 'acknowledged') && (
          <>
            <Button
              icon={<ArrowUpOutlined />}
              loading={isOperatingId === incident.id}
              onClick={handleEscalate}
            >
              升级处理
            </Button>
            <Button
              type="primary"
              danger
              loading={isOperatingId === incident.id}
              onClick={handleResolve}
            >
              标记解决
            </Button>
          </>
        )}
      </Space>

      {/* ── Operation Timeline ─────────────────────────────────────── */}
      <Typography.Title level={5} style={{ color: c.text.primary, marginBottom: 8 }}>
        操作时间线
      </Typography.Title>
      {incident.timeline.length > 0 ? (
        <Timeline
          items={incident.timeline.map((item) => ({
            color: actionColors[item.action] ?? c.status.info,
            dot: item.action === 'triggered' ? <WarningOutlined /> : undefined,
            children: (
              <div>
                <Typography.Text style={{ color: c.text.secondary, fontSize: 11 }}>
                  {formatTime(item.timestamp)}
                </Typography.Text>
                <br />
                <Tag
                  color={actionColors[item.action]}
                  style={{ fontSize: 11, lineHeight: '18px', marginTop: 4 }}
                >
                  {getActionLabel(item.action)}
                </Tag>
                <Typography.Text style={{ color: c.text.muted, fontSize: 11 }}> — {item.actor}</Typography.Text>
                {item.note && (
                  <Typography.Paragraph
                    style={{ color: c.text.secondary, fontSize: 12, marginTop: 4, marginBottom: 0 }}
                  >
                    {item.note}
                  </Typography.Paragraph>
                )}
              </div>
            ),
          }))}
        />
      ) : (
        <Typography.Text type="secondary">暂无操作记录</Typography.Text>
      )}

      {/* ── Add Note ───────────────────────────────────────────────── */}
      {incident.status !== 'resolved' && (
        <div style={{ marginTop: 16 }}>
          <Input.Search
            placeholder="添加备注..."
            enterButton="提交"
            size="small"
            onSearch={(value) => {
              if (value.trim()) {
                addIncidentNote(incident.id, value.trim());
              }
            }}
          />
        </div>
      )}
    </Drawer>
  );
}
