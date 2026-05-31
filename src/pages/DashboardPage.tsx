import { useEffect, useMemo, useRef, useState } from 'react';
import { Row, Col, Card, Statistic, Alert, Typography, App, Space, Button, Segmented, Badge, Timeline, Steps, Progress, theme } from 'antd';
import { CheckCircleOutlined, BellOutlined, SettingOutlined, ApiOutlined, ThunderboltOutlined, PlayCircleOutlined, ArrowRightOutlined, LineChartOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { useRealtimeStore } from '../hooks/useRealtimeStore';
import { useIncidentStore } from '../hooks/useIncidentStore';
import SpectrogramHeatmap from '../components/charts/SpectrogramHeatmap';
import RiskGauge from '../components/charts/RiskGauge';
import CSIChart from '../components/charts/CSIChart';
import { getThemeColors } from '../styles/tokens';
import type { TimeRange } from '../store';

const { Text } = Typography;

function formatRelative(ts: number) { const d = Date.now() - ts; if (d < 60_000) return `${Math.floor(d / 1000)}s`; if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`; return `${Math.floor(d / 3_600_000)}h`; }
function getActivityLabel(l?: string) { if (!l) return '--'; const m: Record<string, string> = { fall: '跌倒', non_fall: '非跌倒', walking: '行走', sitting: '坐姿', lying: '躺卧' }; return m[l] ?? l; }
function computeDisturbance(s: number[]) { if (s.length === 0) return 0; const m = s.reduce((a, v) => a + v, 0) / s.length; const v = s.reduce((a, x) => a + (x - m) ** 2, 0) / s.length; const pp = Math.max(...s) - Math.min(...s); return Math.min(100, Math.round(v * 40 + pp * 25)); }
const TR_MS: Record<TimeRange, number> = { '1h': 3_600_000, '24h': 86_400_000, '7d': 604_800_000 };

export default function DashboardPage() {
  const { token } = theme.useToken();
  const darkMode = useAppStore((s) => s.darkMode);
  const c = getThemeColors(darkMode);

  const apiState = useAppStore((s) => s.apiState);
  const wsState = useAppStore((s) => s.wsState);
  const backendStatus = useAppStore((s) => s.backendStatus);
  const modelStatus = useAppStore((s) => s.modelStatus);
  const currentFps = useAppStore((s) => s.currentFps);
  const wsLatency = useAppStore((s) => s.wsLatency);
  const currentSource = useAppStore((s) => s.currentSource);
  const currentDetectorMode = useAppStore((s) => s.currentDetectorMode);
  const latestMessage = useAppStore((s) => s.latestMessage);
  const incidents = useAppStore((s) => s.incidents);
  const timeRange = useAppStore((s) => s.timeRange);
  const setTimeRange = useAppStore((s) => s.setTimeRange);
  const muted = useAppStore((s) => s.muted);
  const fullscreen = useAppStore((s) => s.fullscreen);
  const setFullscreen = useAppStore((s) => s.setFullscreen);
  const systemEvents = useAppStore((s) => s.systemEvents);
  const showGuide = useAppStore((s) => s.showGuide);
  const dismissGuide = useAppStore((s) => s.dismissGuide);

  const { notification } = App.useApp();
  const navigate = useNavigate();
  useRealtimeStore();
  useIncidentStore();

  const frame = latestMessage?.frame;
  const result = latestMessage?.result;
  const subcarriers = useMemo(() => frame?.subcarriers ?? [], [frame]);
  const alertActive = Boolean(result?.alert);

  const [frameHistory, setFrameHistory] = useState<number[][]>([]);
  const [frameIdHistory, setFrameIdHistory] = useState<number[]>([]);
  const prevFrameRef = useRef<number | undefined>(undefined);
  const [showRawSignal, setShowRawSignal] = useState(false);

  useEffect(() => {
    if (frame && subcarriers.length > 0 && frame.frame_id !== prevFrameRef.current) {
      prevFrameRef.current = frame.frame_id;
      setFrameHistory((prev) => [...prev.slice(-119), subcarriers]);
      setFrameIdHistory((prev) => [...prev.slice(-119), frame.frame_id]);
    }
  }, [frame?.frame_id, subcarriers]);

  const lastGood = useRef({ subcarriers: [] as number[], frame: undefined as typeof frame });
  useEffect(() => { if (wsState === 'online' && subcarriers.length > 0) lastGood.current = { subcarriers, frame }; }, [wsState, subcarriers, frame]);
  const displaySubcarriers = wsState === 'online' || wsState === 'checking' ? subcarriers : lastGood.current.subcarriers;
  const displayFrame = wsState === 'online' || wsState === 'checking' ? frame : lastGood.current.frame;

  const disturbanceIndex = useMemo(() => computeDisturbance(displaySubcarriers), [displaySubcarriers]);
  const peakDisturbance = useMemo(() => { let max = 0; for (const f of frameHistory) max = Math.max(max, computeDisturbance(f)); return max; }, [frameHistory]);

  const healthScore = useMemo(() => {
    const apiPart = apiState === 'online' ? 30 : apiState === 'checking' ? 15 : 0;
    const wsPart = wsState === 'online' ? 30 : wsState === 'checking' ? 15 : 0;
    const modelPart = modelStatus?.model_loaded ? 25 : 0;
    const fpsPart = Math.min(15, Math.round((currentFps / 10) * 15));
    return Math.max(0, Math.min(100, apiPart + wsPart + modelPart + fpsPart));
  }, [apiState, wsState, modelStatus?.model_loaded, currentFps]);

  const runtime = backendStatus?.runtime;
  const uptimeText = useMemo(() => {
    const seconds = Math.floor(Number(runtime?.uptime_seconds ?? 0));
    if (!seconds) return '--';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }, [runtime?.uptime_seconds]);

  const latestConfidencePct = Math.round((latestMessage?.result?.confidence ?? 0) * 100);
  const alertTrendBins = useMemo(() => {
    const now = Date.now();
    const binCount = 10;
    const windowMs = 10 * 60 * 1000;
    const binMs = windowMs / binCount;
    const start = now - windowMs;
    const bins = Array.from({ length: binCount }, () => 0);

    for (const inc of incidents) {
      const ts = Number(inc.lastSeen ?? 0);
      if (!ts || ts < start || ts > now) continue;
      const idx = Math.min(binCount - 1, Math.floor((ts - start) / binMs));
      bins[idx] += 1;
    }

    return bins;
  }, [incidents]);
  const alertTrendMax = Math.max(1, ...alertTrendBins);

  const alertPalette = useMemo(() => {
    if (darkMode) {
      return {
        bg: 'linear-gradient(90deg, #7f1d1d 0%, #991b1b 55%, #b91c1c 100%)',
        border: '#f87171',
        title: '#fee2e2',
        body: 'rgba(254, 226, 226, 0.92)',
        icon: '#fecaca',
      };
    }
    return {
      bg: 'linear-gradient(90deg, #fee2e2 0%, #fecaca 55%, #fecaca 100%)',
      border: '#ef4444',
      title: '#991b1b',
      body: '#7f1d1d',
      icon: '#b91c1c',
    };
  }, [darkMode]);

  const cutoff = useMemo(() => Date.now() - TR_MS[timeRange], [timeRange]);
  const filteredIncidents = useMemo(() => incidents.filter((i) => i.lastSeen >= cutoff), [incidents, cutoff]);
  const fallCount = useMemo(() => filteredIncidents.filter((i) => i.predictedLabel === 'fall').length, [filteredIncidents]);
  const otherCount = useMemo(() => filteredIncidents.filter((i) => i.predictedLabel !== 'fall').length, [filteredIncidents]);
  const triggeredCount = useMemo(() => filteredIncidents.filter((i) => i.status === 'triggered').length, [filteredIncidents]);
  const resolvedCount = useMemo(() => filteredIncidents.filter((i) => i.status === 'resolved').length, [filteredIncidents]);

  const [alertBannerVisible, setAlertBannerVisible] = useState(false);
  const alertReasonRef = useRef('');
  const prevAlertRef = useRef(false);
  useEffect(() => { if (alertActive) { alertReasonRef.current = result?.reason ?? ''; setAlertBannerVisible(true); return; } if (!alertBannerVisible) return; const t = window.setTimeout(() => setAlertBannerVisible(false), 10_000); return () => window.clearTimeout(t); }, [alertActive]);
  useEffect(() => { if (alertActive && !prevAlertRef.current && !muted) { notification.warning({ title: '⚠ 跌倒告警触发', description: result?.reason?.slice(0, 80) ?? '', placement: 'bottomRight', duration: 8 }); } prevAlertRef.current = alertActive; }, [alertActive, result?.reason, muted]);

  const apiError = useAppStore((s) => s.apiError); const wsError = useAppStore((s) => s.wsError);
  useEffect(() => { if (apiError && !muted) notification.error({ title: 'API Error', description: apiError, placement: 'bottomRight' }); }, [apiError, muted]);
  useEffect(() => { if (wsError) notification.error({ title: 'WS Error', description: wsError, placement: 'bottomRight' }); }, [wsError]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && fullscreen) setFullscreen(false); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [fullscreen, setFullscreen]);
  useEffect(() => { if (apiState === 'online' && wsState === 'online' && showGuide) { const t = setTimeout(dismissGuide, 2000); return () => clearTimeout(t); } }, [apiState, wsState, showGuide, dismissGuide]);

  const recentEvents = useMemo(() => systemEvents.slice(0, 20), [systemEvents]);

  return (
    <div style={fullscreen ? { position: 'fixed', inset: 0, zIndex: 9999, background: token.colorBgLayout, padding: 12, overflow: 'auto' } : undefined}>
      {/* ── Toolbar ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <Space size={6}>
          <Segmented value={timeRange} onChange={(v) => setTimeRange(v as TimeRange)} size="small" options={[{ value: '1h', label: '1h' }, { value: '24h', label: '24h' }, { value: '7d', label: '7d' }]} />
          <Text type="secondary" style={{ fontSize: 10 }}>时间过滤（暂模拟）</Text>
        </Space>
      </div>

      {alertBannerVisible && (
        <Alert banner closable
          type="error" showIcon icon={<BellOutlined style={{ color: alertPalette.icon }} />}
          onClose={() => setAlertBannerVisible(false)}
          title={<span style={{ color: alertPalette.title, fontWeight: 700, fontSize: 14 }}>跌倒告警</span>}
          description={<span style={{ color: alertPalette.body }}>{alertReasonRef.current}</span>}
          style={{ marginBottom: 10, background: alertPalette.bg, border: `1px solid ${alertPalette.border}` }} />
      )}

      {showGuide && apiState !== 'online' && (
        <Card style={{ marginBottom: 10, border: `1px solid ${c.status.warning}` }} size="small">
          <Steps current={0} size="small" items={[{ title: '选择数据源', icon: <ApiOutlined /> }, { title: '选择检测器', icon: <ThunderboltOutlined /> }, { title: '启动监控', icon: <PlayCircleOutlined /> }]} />
          <div style={{ marginTop: 8 }}><Button type="primary" size="small" icon={<SettingOutlined />} onClick={() => navigate('/settings')}>前往配置 <ArrowRightOutlined /></Button></div>
        </Card>
      )}

  <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
    <div style={{ flex: 3, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row gutter={[8, 8]}>
        <Col xs={12} sm={12} xl={12}>
          <Row gutter={[6, 6]}>
            <Col span={12}>
              <Card size="small" styles={{ body: { padding: '6px 10px' } }}>
                <Statistic title="今日告警" value={filteredIncidents.length} valueStyle={{ color: c.status.info, fontSize: 22 }} />
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" styles={{ body: { padding: '6px 10px' } }}>
                <Statistic title="已处理" value={resolvedCount} valueStyle={{ color: c.status.success, fontSize: 22 }} />
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" styles={{ body: { padding: '6px 10px' } }}>
                <Statistic title="未处理" value={triggeredCount} valueStyle={{ color: triggeredCount > 0 ? c.status.danger : c.status.success, fontSize: 22 }} prefix={triggeredCount > 0 ? <Badge status="error" /> : <CheckCircleOutlined />} />
                {/* <Progress percent={filteredIncidents.length > 0 ? (triggeredCount / filteredIncidents.length) * 100 : 0} showInfo={false} strokeColor={c.status.danger} trailColor={darkMode ? 'rgba(239,91,107,0.12)' : 'rgba(239,91,107,0.08)'} size="small" /> */}
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" styles={{ body: { padding: '6px 10px' } }}>
                <div style={{ fontSize: 14, color: c.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>分类</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}><span style={{ color: c.status.danger }}>跌倒</span><strong>{fallCount}</strong></div>
                {/* <Progress percent={filteredIncidents.length > 0 ? (fallCount / filteredIncidents.length) * 100 : 0} showInfo={false} strokeColor={c.status.danger} trailColor={darkMode ? 'rgba(239,91,107,0.12)' : 'rgba(239,91,107,0.08)'} size="small" /> */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span style={{ color: c.status.info }}>其他</span><strong>{otherCount}</strong></div>
              </Card>
            </Col>
          </Row>
        </Col>
        <Col xs={12} sm={12} xl={6}>
          <Card size="small" styles={{ body: { padding: '6px 12px' } }}>
            <RiskGauge value={disturbanceIndex} peakValue={peakDisturbance} height={160} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[8, 8]}>
        <Col xs={24} md={12} xl={8}>
          <Card size="small" styles={{ body: { padding: '10px 12px' } }} title={<span style={{ fontSize: 12 }}>运行健康指数</span>}>
            <Progress percent={healthScore} size="small" strokeColor={healthScore >= 80 ? c.status.success : healthScore >= 55 ? c.status.warning : c.status.danger} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ fontSize: 11 }} type="secondary">运行时长 {uptimeText}</Text>
              <Text style={{ fontSize: 11 }} type="secondary">总帧 {runtime?.total_frames ?? '--'}</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={12} xl={8}>
          <Card size="small" styles={{ body: { padding: '10px 12px' } }} title={<span style={{ fontSize: 12 }}>数据链路质量</span>}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 11 }} type="secondary">FPS</Text>
              <Text strong style={{ fontSize: 12, color: currentFps >= 1 ? c.status.success : c.status.warning }}>{currentFps.toFixed(1)}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 11 }} type="secondary">WS 延迟</Text>
              <Text strong style={{ fontSize: 12, color: wsLatency <= 400 ? c.status.success : c.status.warning }}>{wsLatency || '--'} ms</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11 }} type="secondary">模型置信度</Text>
              <Text strong style={{ fontSize: 12, color: latestConfidencePct >= 80 ? c.status.success : c.status.warning }}>{latestConfidencePct}%</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={24} xl={8}>
          <Card size="small" styles={{ body: { padding: '10px 12px' } }} title={<span style={{ fontSize: 12 }}>近10分钟告警趋势</span>}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 46 }}>
              {alertTrendBins.map((v, i) => (
                <div key={`bin-${i}`} style={{ flex: 1, minWidth: 0, height: `${Math.max(8, Math.round((v / alertTrendMax) * 100))}%`, borderRadius: 3, background: v > 0 ? c.status.danger : c.border.muted, opacity: v > 0 ? 0.9 : 0.45 }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ fontSize: 10 }} type="secondary">10m 前</Text>
              <Text style={{ fontSize: 10 }} type="secondary">当前</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ fontSize: 11 }} type="secondary">源：{currentSource}</Text>
              <Text style={{ fontSize: 11 }} type="secondary">检测器：{currentDetectorMode}</Text>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[8, 8]}>
        <Col xs={24} xl={24} style={{ minWidth: 0 }}>
          <Card size="small" styles={{ body: { padding: 2 } }}
            title={<Space size={6}><span style={{ fontSize: 13 }}>{showRawSignal ? '原始 CSI 信号' : '活动强度谱系'}</span><Text type="secondary" style={{ fontSize: 10 }}>{showRawSignal ? `帧 #${displayFrame?.frame_id ?? '--'}` : '子载波 × 时间'}</Text></Space>}
            extra={<Button size="small" type="text" icon={<LineChartOutlined />} onClick={() => setShowRawSignal(!showRawSignal)}>{showRawSignal ? '返回谱系' : '原始信号'}</Button>}>
            {showRawSignal ? (
              <CSIChart frameId={displayFrame?.frame_id} subcarriers={displaySubcarriers} alertActive={alertActive && wsState === 'online'} height={fullscreen ? 480 : 380} />
            ) : (
              <>
                <SpectrogramHeatmap frames={frameHistory} frameIds={frameIdHistory} height={fullscreen ? 480 : 380} />
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: '2px 8px 0' }}>
                  <Text style={{ fontSize: 9, color: c.text.muted }}>■ 深蓝=平静</Text><Text style={{ fontSize: 9, color: c.text.muted }}>■ 黄=扰动</Text><Text style={{ fontSize: 9, color: c.text.muted }}>■ 红=异常</Text>
                </div>
              </>
            )}
          </Card>
        </Col>
      </Row>
    </div>

    <div style={{ flex: 1, minWidth: 240 }}>
      <Card title="系统事件流" size="small"
        styles={{ body: { padding: '4px 10px' } }}
        style={{ height: '100%' }}>
        {recentEvents.length > 0 ? (
          <Timeline items={recentEvents.map((evt) => ({ color: evt.level === 'error' ? 'red' : evt.level === 'warning' ? 'orange' : 'blue', icon: evt.type === 'alert_triggered' ? <BellOutlined style={{ fontSize: 9 }} /> : undefined, content: (<div style={{ fontSize: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><Text strong style={{ fontSize: 10 }}>{evt.title}</Text><Text type="secondary" style={{ fontSize: 8 }}>{formatRelative(evt.timestamp)}</Text></div>{evt.detail && <Text type="secondary" style={{ fontSize: 9 }}>{(evt.detail ?? '').slice(0, 40)}</Text>}</div>) }))} />
        ) : <Text type="secondary" style={{ fontSize: 10 }}>暂无系统事件</Text>}
      </Card>
    </div>
  </div>
    </div>
  );
}
