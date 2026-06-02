import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Card, Space, Typography, Badge, Segmented, Button, Tooltip, theme } from 'antd';
import {
  PlayCircleOutlined, PauseOutlined, StepForwardOutlined, StepBackwardOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../store';
import { useIncidentStore } from '../hooks/useIncidentStore';
import MicroDopplerChart from '../components/charts/MicroDopplerChart';
import SubcarrierStackChart from '../components/charts/SubcarrierStackChart';
import AntennaCorrelationChart from '../components/charts/AntennaCorrelationChart';
import ConfidenceGauge from '../components/charts/ConfidenceGauge';
import MetricCards from '../components/charts/MetricCards';
import { getThemeColors, fontFamily } from '../styles/tokens';

const { Text, Title } = Typography;
const ANALYTICS_WINDOW = 600; // store up to 600 frames

function StatusBar() {
  const darkMode = useAppStore((s) => s.darkMode);
  const c = getThemeColors(darkMode);
  const backendStatus = useAppStore((s) => s.backendStatus);
  const currentSource = useAppStore((s) => s.currentSource);
  const currentDetectorMode = useAppStore((s) => s.currentDetectorMode);
  const wsState = useAppStore((s) => s.wsState);
  const latestResult = useAppStore((s) => s.latestMessage?.result);

  const runtime = backendStatus?.runtime;
  const uptime = useMemo(() => {
    const s = Math.floor(Number(runtime?.uptime_seconds ?? 0));
    if (!s) return '--';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }, [runtime?.uptime_seconds]);

  const riskLevel = latestResult?.risk_level ?? 'low';
  const riskColor =
    riskLevel === 'high' ? '#ef4444' : riskLevel === 'medium' ? '#f59e0b' : '#22c55e';

  const totalFrames = runtime?.total_frames ?? 0;
  const alertCount = runtime?.alert_count ?? 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px',
        background: darkMode ? '#0d1117' : '#f6f8fa',
        borderBottom: `1px solid ${darkMode ? '#1a2a3a' : '#e5e7eb'}`,
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      {/* Left: source info */}
      <Space size={10}>
        <Badge status={wsState === 'online' ? 'processing' : 'default'} color="#22c55e" />
        <Text style={{ fontSize: 12, color: c.text.muted, fontFamily: fontFamily.mono }}>
          {currentSource} · {currentDetectorMode}
        </Text>
        <Text style={{ fontSize: 11, color: c.text.muted, fontFamily: fontFamily.mono }}>
          运行 {uptime} · 总帧 {totalFrames}
        </Text>
      </Space>

      {/* Right: risk & alerts */}
      <Space size={10}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 10px',
            borderRadius: 2,
            border: `1px solid ${riskColor}`,
            background: `${riskColor}15`,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: riskColor,
              display: 'inline-block',
            }}
          />
          <Text style={{ fontSize: 11, color: riskColor, fontFamily: fontFamily.mono, fontWeight: 600 }}>
            {riskLevel.toUpperCase()}
          </Text>
        </div>
        <Text style={{ fontSize: 11, color: c.text.muted, fontFamily: fontFamily.mono }}>
          告警: <strong style={{ color: '#ef4444' }}>{alertCount}</strong>
        </Text>
      </Space>
    </div>
  );
}

function IncidentTimeline({
  onJumpToFrame,
}: {
  onJumpToFrame: (frameId: number) => void;
}) {
  const incidents = useAppStore((s) => s.incidents);
  const selectedIncidentId = useAppStore((s) => s.selectedIncidentId);
  const setSelectedIncidentId = useAppStore((s) => s.setSelectedIncidentId);
  const darkMode = useAppStore((s) => s.darkMode);
  const c = getThemeColors(darkMode);

  const recentIncidents = useMemo(
    () => incidents.slice(0, 15),
    [incidents],
  );

  return (
    <div style={{ maxHeight: 280, overflowY: 'auto' }}>
      <Text
        strong
        style={{
          fontSize: 11,
          color: c.text.muted,
          fontFamily: fontFamily.mono,
          textTransform: 'uppercase',
          display: 'block',
          marginBottom: 6,
        }}
      >
        事故时间线
      </Text>
      {recentIncidents.length === 0 ? (
        <Text style={{ fontSize: 10, color: '#556677', fontFamily: fontFamily.mono }}>
          暂无告警记录
        </Text>
      ) : (
        recentIncidents.map((inc) => (
          <div
            key={inc.id}
            onClick={() => {
              setSelectedIncidentId(inc.id ?? '');
            }}
            style={{
              cursor: 'pointer',
              padding: '6px 8px',
              marginBottom: 4,
              borderRadius: 2,
              border: `1px solid ${
                inc.id === selectedIncidentId ? '#00aacc' : (darkMode ? '#1a2a3a' : '#e5e7eb')
              }`,
              background:
                inc.id === selectedIncidentId
                  ? 'rgba(0,170,204,0.08)'
                  : 'rgba(255,255,255,0.02)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Badge
                status={
                  inc.status === 'triggered'
                    ? 'error'
                    : inc.status === 'resolved'
                      ? 'success'
                      : 'processing'
                }
                text={
                  <Text style={{ fontSize: 10, color: c.text.primary, fontFamily: fontFamily.mono }}>
                    {inc.predictedLabel === 'fall' ? '⚠ 跌倒' : inc.predictedLabel}
                  </Text>
                }
              />
              <Text style={{ fontSize: 9, color: c.text.secondary, fontFamily: fontFamily.mono }}>
                {(typeof inc.confidence === 'number' ? inc.confidence * 100 : 0).toFixed(0)}%
              </Text>
            </div>
            <Text
              style={{
                fontSize: 9,
                color: c.text.muted,
                fontFamily: fontFamily.mono,
                display: 'block',
                marginTop: 2,
              }}
            >
              {inc.room ?? '--'} · {typeof inc.lastSeen === 'number' ? new Date(inc.lastSeen).toLocaleTimeString() : '--'}
            </Text>
          </div>
        ))
      )}
    </div>
  );
}

function GlobalTimeline({
  onSeek,
}: {
  onSeek: (index: number) => void;
}) {
  const analyticsHistory = useAppStore((s) => s.analyticsHistory);
  const globalTimeCursor = useAppStore((s) => s.globalTimeCursor);
  const playbackMode = useAppStore((s) => s.playbackMode);
  const setPlaybackMode = useAppStore((s) => s.setPlaybackMode);
  const setGlobalTimeCursor = useAppStore((s) => s.setGlobalTimeCursor);
  const darkMode = useAppStore((s) => s.darkMode);
  const c = getThemeColors(darkMode);
  const incidents = useAppStore((s) => s.incidents);

  const totalFrames = analyticsHistory.length;
  const [playing, setPlaying] = useState(false);
  const playRef = useRef<number | null>(null);

  // Alert markers on timeline
  const alertMarkers = useMemo(() => {
    const markers: { index: number; eventId: string }[] = [];
    const recentWindow = analyticsHistory;
    for (const inc of incidents.slice(0, 30)) {
      const incTime = typeof inc.lastSeen === 'number' ? inc.lastSeen : 0;
      if (!incTime || inc.predictedLabel !== 'fall') continue;
      const eventId = inc.alerts?.[0]?.event_id;
      if (!eventId) continue;
      let bestIdx = -1;
      let bestDist = Infinity;
      recentWindow.forEach((e, i) => {
        const dist = Math.abs((e.timestamp ?? 0) * 1000 - incTime);
        if (dist < bestDist && dist < 5000) {
          bestDist = dist;
          bestIdx = i;
        }
      });
      if (bestIdx >= 0) markers.push({ index: bestIdx, eventId });
    }
    return markers;
  }, [analyticsHistory, incidents]);

  // Playback loop
  useEffect(() => {
    if (playing) {
      playRef.current = window.setInterval(() => {
        setGlobalTimeCursor((useAppStore.getState().globalTimeCursor ?? 0) + 1);
        const next = (useAppStore.getState().globalTimeCursor ?? 0) + 1;
        if (next >= totalFrames) {
          setPlaying(false);
          setPlaybackMode('live');
          setGlobalTimeCursor(null);
        } else {
          setGlobalTimeCursor(next);
          onSeek(next);
        }
      }, 100);
      return () => {
        if (playRef.current != null) window.clearInterval(playRef.current);
      };
    }
  }, [playing, totalFrames, setGlobalTimeCursor, setPlaybackMode, onSeek]);

  const cursorPercent =
    globalTimeCursor != null && totalFrames > 0
      ? (globalTimeCursor / (totalFrames - 1)) * 100
      : 100;

  const handleGoLive = () => {
    setPlaying(false);
    setPlaybackMode('live');
    setGlobalTimeCursor(null);
  };

  return (
    <div
      style={{
        padding: '6px 16px 8px',
        background: darkMode ? '#0a0e14' : '#f0f2f5',
        borderTop: `1px solid ${darkMode ? '#1a2a3a' : '#e5e7eb'}`,
      }}
    >
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <Space size={6}>
          <Tooltip title="回退 10 帧">
            <Button
              size="small"
              type="text"
              icon={<StepBackwardOutlined />}
              onClick={() => {
                const cur = globalTimeCursor ?? totalFrames - 1;
                const next = Math.max(0, cur - 10);
                setGlobalTimeCursor(next);
                setPlaybackMode('review');
                onSeek(next);
              }}
              style={{ color: '#8899aa', fontSize: 11 }}
            />
          </Tooltip>
          <Tooltip title={playing ? '暂停' : '播放'}>
            <Button
              size="small"
              type="text"
              icon={playing ? <PauseOutlined /> : <PlayCircleOutlined />}
              onClick={() => {
                if (playing) {
                  setPlaying(false);
                } else {
                  setPlaybackMode('review');
                  if (globalTimeCursor == null) setGlobalTimeCursor(totalFrames - 100);
                  setPlaying(true);
                }
              }}
              style={{ color: '#8899aa', fontSize: 11 }}
            />
          </Tooltip>
          <Tooltip title="前进 10 帧">
            <Button
              size="small"
              type="text"
              icon={<StepForwardOutlined />}
              onClick={() => {
                const cur = globalTimeCursor ?? totalFrames - 1;
                const next = Math.min(totalFrames - 1, cur + 10);
                setGlobalTimeCursor(next);
                setPlaybackMode('review');
                onSeek(next);
              }}
              style={{ color: '#8899aa', fontSize: 11 }}
            />
          </Tooltip>
        </Space>

        <Space size={6}>
          <Segmented
            size="small"
            value={playbackMode}
            onChange={(v) => {
              if (v === 'live') handleGoLive();
              else {
                setPlaybackMode('review');
                if (globalTimeCursor == null) setGlobalTimeCursor(totalFrames - 1);
              }
            }}
            options={[
              { value: 'live', label: '实时' },
              { value: 'review', label: '回放' },
            ]}
          />
          <Text style={{ fontSize: 10, color: c.text.muted, fontFamily: fontFamily.mono }}>
            {globalTimeCursor != null ? `定位 T-${totalFrames - (globalTimeCursor ?? 0)}` : '● 实时收集中'} · {totalFrames} 帧
          </Text>
        </Space>
      </div>

      {/* Slider track */}
      <div
        style={{
          position: 'relative',
          height: 24,
          background: darkMode ? '#111922' : '#e5e7eb',
          borderRadius: 2,
          cursor: 'pointer',
          overflow: 'hidden',
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          const idx = Math.round(pct * (totalFrames - 1));
          setGlobalTimeCursor(idx);
          setPlaybackMode('review');
          setPlaying(false);
          onSeek(idx);
        }}
      >
        {/* Alert markers — click to open 3D replay */}
        {alertMarkers.map((m, i) => (
          <a key={i} href={`#/replay?eventId=${m.eventId}`}
            title="查看3D 回放"
            style={{
              position: 'absolute',
              left: `${((m.index / (totalFrames - 1)) * 100).toFixed(2)}%`,
              top: 0, width: 6, height: '100%',
              background: '#ef4444', opacity: 0.85,
              cursor: 'pointer', zIndex: 2,
            }}
          />
        ))}
        {/* Progress fill */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${cursorPercent.toFixed(1)}%`,
            background: playbackMode === 'live' ? '#1a3344' : '#1a3a4a',
            borderRadius: 2,
          }}
        />
        {/* Cursor */}
        <div
          style={{
            position: 'absolute',
            left: `${cursorPercent.toFixed(1)}%`,
            top: -2,
            width: 4,
            height: 28,
            background: playbackMode === 'live' ? '#22c55e' : '#00aacc',
            borderRadius: 2,
            boxShadow: '0 0 8px rgba(0,170,204,0.6)',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Time labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ fontSize: 9, color: c.text.muted, fontFamily: fontFamily.mono }}>← 拖动滑块回溯历史帧 →</Text>
        <Text style={{ fontSize: 9, color: c.text.muted, fontFamily: fontFamily.mono }}>{totalFrames > 0 ? `共 ${totalFrames} 帧 (${(totalFrames * 0.1).toFixed(0)} 秒)` : '等待数据...'}</Text>
      </div>
    </div>
  );
}

// ── Main AnalysisPanel ─────────────────────────────────────────────────

export default function AnalysisPanel() {
  const { token } = theme.useToken();
  const darkMode = useAppStore((s) => s.darkMode);
  const c = getThemeColors(darkMode);
  const fullscreen = useAppStore((s) => s.fullscreen);
  const setFullscreen = useAppStore((s) => s.setFullscreen);

  useIncidentStore();

  // Track the highlighted frame for timeline sync
  const [highlightFrameId, setHighlightFrameId] = useState<number | null>(null);
  const globalTimeCursor = useAppStore((s) => s.globalTimeCursor);
  const analyticsHistory = useAppStore((s) => s.analyticsHistory);

  // When globalTimeCursor changes (via timeline drag), resolve frame_id
  useEffect(() => {
    if (globalTimeCursor != null && analyticsHistory.length > 0) {
      const idx = Math.min(globalTimeCursor, analyticsHistory.length - 1);
      const entry = analyticsHistory[idx];
      if (entry) {
        setHighlightFrameId(entry.frame_id);
      }
    } else {
      setHighlightFrameId(null);
    }
  }, [globalTimeCursor, analyticsHistory]);

  const handleTimelineSeek = useCallback(
    (index: number) => {
      if (analyticsHistory.length > 0) {
        const entry = analyticsHistory[Math.min(index, analyticsHistory.length - 1)];
        if (entry) setHighlightFrameId(entry.frame_id);
      }
    },
    [analyticsHistory],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreen) setFullscreen(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [fullscreen, setFullscreen]);

  return (
    <div
      style={
        fullscreen
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: token.colorBgLayout,
              display: 'flex',
              flexDirection: 'column',
            }
          : {
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              minHeight: 600,
            }
      }
    >
      <StatusBar />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── Left: Charts Area (70%) ───────────────────────────────── */}
        <div
          style={{
            flex: 7,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            padding: '6px 8px',
            overflow: 'hidden',
          }}
        >
          <Card
            size="small"
            styles={{ body: { padding: '4px 8px' } }}
            title={
              <Space size={6}>
                <a href="https://en.wikipedia.org/wiki/Doppler_effect" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, fontFamily: fontFamily.mono, color: 'inherit', textDecoration: 'none' }}
                  title="什么是微多普勒效应？点击了解">微多普勒频谱 </a>
                <Text type="secondary" style={{ fontSize: 9 }}>
                  频率 × 时间 · dB
                </Text>
              </Space>
            }
          >
            <MicroDopplerChart
              height={fullscreen ? 420 : 220}
              highlightFrameId={highlightFrameId}
            />
          </Card>

          <Card
            size="small"
            styles={{ body: { padding: '4px 8px' } }}
            title={
              <Space size={6}>
                <a href="https://en.wikipedia.org/wiki/Channel_state_information" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, fontFamily: fontFamily.mono, color: 'inherit', textDecoration: 'none' }}
                  title="什么是 CSI 子载波？点击了解">子载波堆叠图</a>
                <Text type="secondary" style={{ fontSize: 9 }}>
                  30 子载波 × 200 帧
                </Text>
              </Space>
            }
          >
            <SubcarrierStackChart
              height={fullscreen ? 320 : 200}
              highlightFrameId={highlightFrameId}
            />
          </Card>

          <Card
            size="small"
            styles={{ body: { padding: '4px 8px' } }}
            title={
              <Space size={6}>
                <a href="https://en.wikipedia.org/wiki/Correlation_coefficient" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, fontFamily: fontFamily.mono, color: 'inherit', textDecoration: 'none' }}
                  title="什么是皮尔逊相关系数？点击了解">{useAppStore.getState().currentDetectorMode === 'cnn2d' ? '子载波相关性' : '天线相关性'}</a>
                <Text type="secondary" style={{ fontSize: 9 }}>
                  {useAppStore.getState().currentDetectorMode === 'cnn2d' ? '子载波频段间皮尔逊相关' : '3 天线皮尔逊相关系数'}
                </Text>
              </Space>
            }
          >
            <AntennaCorrelationChart
              height={fullscreen ? 220 : 150}
              highlightFrameId={highlightFrameId}
            />
          </Card>
        </div>

        {/* ── Right: Side Panel (30%) ───────────────────────────────── */}
        <div
          style={{
            flex: 3,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '6px 8px',
            borderLeft: `1px solid ${darkMode ? '#1a2a3a' : '#e5e7eb'}`,
            overflow: 'hidden',
          }}
        >
          <Card size="small" styles={{ body: { padding: '10px 12px' } }}>
            <ConfidenceGauge size={fullscreen ? 160 : 130} />
          </Card>

          <Card
            size="small"
            styles={{ body: { padding: '8px 10px' } }}
            title={
              <span style={{ fontSize: 11, fontFamily: fontFamily.mono }}>实时指标</span>
            }
          >
            <MetricCards />
          </Card>

          <Card
            size="small"
            styles={{ body: { padding: '6px 10px' } }}
            title={
              <Space size={6}>
                <span style={{ fontSize: 11, fontFamily: fontFamily.mono }}>事故记录</span>
                <ThunderboltOutlined style={{ color: '#ef4444', fontSize: 11 }} />
              </Space>
            }
          >
            <IncidentTimeline
              onJumpToFrame={(frameId) => {
                // Find index in analyticsHistory
                const idx = analyticsHistory.findIndex((e) => e.frame_id === frameId);
                if (idx >= 0) {
                  useAppStore.getState().setGlobalTimeCursor(idx);
                  setHighlightFrameId(frameId);
                }
              }}
            />
          </Card>

          {/* Quick nav buttons */}
          <Space style={{ justifyContent: 'center' }}>
            <a href="#/incidents" style={{ fontSize: 11, color: 'inherit', textDecoration: 'none', fontFamily: fontFamily.mono }}>
              全部告警 →
            </a>
            <a href="#/settings" style={{ fontSize: 11, color: 'inherit', textDecoration: 'none', fontFamily: fontFamily.mono }}>
              设置 →
            </a>
          </Space>
        </div>
      </div>

      <GlobalTimeline onSeek={handleTimelineSeek} />
    </div>
  );
}
