import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Progress, Space, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, PauseOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { getEventReplay } from '../api/client';
import RF3DScene, { type PlaybackState, type ReplayData } from '../components/visualization/RF3DScene';
import type { EventReplayResponse } from '../types/csi';
import { fontFamily } from '../styles/tokens';

const { Text, Title } = Typography;
const MOBILE_EVENTS_KEY = 'wifi-fall-mobile-events';

interface SavedEventView {
  eventId: string;
  timestamp: number;
  room: string;
  confidence: number;
  status: 'saved' | 'pending';
  replayUrl: string;
  message?: string;
}

function loadSavedEvents(): SavedEventView[] {
  try {
    const raw = window.localStorage.getItem(MOBILE_EVENTS_KEY);
    return raw ? JSON.parse(raw) as SavedEventView[] : [];
  } catch {
    return [];
  }
}

function getEventIdFromHash() {
  const query = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(query).get('eventId') ?? '';
}

function toReplayData(data: EventReplayResponse): ReplayData {
  return {
    event_id: data.event_id,
    windows: data.windows,
    start_window_index: data.start_window_index,
    centre_window_index: data.centre_window_index,
  };
}

export default function MobileReplayPage() {
  const [events, setEvents] = useState<SavedEventView[]>(() => loadSavedEvents());
  const [eventId, setEventId] = useState(() => getEventIdFromHash());
  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playback, setPlayback] = useState<PlaybackState>({
    playing: true,
    speed: 1,
    currentFrame: 0,
    loop: true,
    phase: 'normal',
  });
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const onHash = () => setEventId(getEventIdFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refreshEvents = useCallback(() => {
    setEvents(loadSavedEvents());
  }, []);

  const loadReplay = useCallback(async (id: string) => {
    if (!id) {
      setReplayData(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await getEventReplay(id);
      setReplayData(toReplayData(data));
      setPlayback(prev => ({ ...prev, currentFrame: 0, playing: true }));
    } catch (e) {
      setReplayData(null);
      setError(e instanceof Error ? e.message : '回放数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReplay(eventId);
    refreshEvents();
  }, [eventId, loadReplay, refreshEvents]);

  const totalFrames = replayData?.windows.length ?? 0;

  useEffect(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!playback.playing || totalFrames <= 0) return;
    timerRef.current = window.setInterval(() => {
      setPlayback(prev => {
        const next = prev.currentFrame + 1;
        if (next >= totalFrames) {
          return prev.loop ? { ...prev, currentFrame: 0 } : { ...prev, currentFrame: totalFrames - 1, playing: false };
        }
        return { ...prev, currentFrame: next };
      });
    }, 120 / playback.speed);
    return () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
    };
  }, [playback.loop, playback.playing, playback.speed, totalFrames]);

  const selectedEvent = useMemo(
    () => events.find(item => item.eventId === eventId) ?? null,
    [eventId, events],
  );
  const currentWindow = replayData?.windows[playback.currentFrame];
  const fallen = currentWindow?.avatar?.display_state === 'fallen' || currentWindow?.label === 'fall';
  const confidence = currentWindow?.avatar?.confidence ?? selectedEvent?.confidence ?? 0;
  const confidencePct = Math.round(confidence * 100);

  return (
    <div style={{ minHeight: '100vh', background: '#fff4eb', fontFamily: fontFamily.sans }}>
      <div style={{ maxWidth: 460, margin: '0 auto', minHeight: '100vh' }}>
        <section
          style={{
            padding: '14px 18px 74px',
            color: '#fff',
            background: fallen
              ? 'linear-gradient(160deg, #ff6b6f 0%, #f5575f 100%)'
              : 'linear-gradient(160deg, #ffad22 0%, #f28a00 100%)',
            borderBottomLeftRadius: 30,
            borderBottomRightRadius: 30,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
            <a href="#/mobile" style={{ color: '#fff', fontSize: 18 }}><ArrowLeftOutlined /></a>
            <Text style={{ color: '#fff', fontWeight: 700 }}>手机端回放</Text>
            <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => loadReplay(eventId)} style={{ color: '#fff' }} />
          </div>
          <Title level={2} style={{ color: '#fff', margin: 0 }}>{fallen ? '摔倒回放' : '安全回放'}</Title>
          <Text style={{ color: 'rgba(255,255,255,0.9)' }}>
            {selectedEvent ? new Date(selectedEvent.timestamp * 1000).toLocaleString('zh-CN') : eventId || '请选择记录'}
          </Text>
          <div style={{ marginTop: 18 }}>
            <Text style={{ color: '#fff' }}>置信度 {confidencePct}%</Text>
            <Progress percent={confidencePct} showInfo={false} strokeColor="#fff" trailColor="rgba(255,255,255,0.28)" />
          </div>
        </section>

        <main style={{ padding: '0 14px 24px', marginTop: -54 }}>
          <section
            style={{
              background: '#fff',
              borderRadius: 18,
              padding: 12,
              boxShadow: '0 16px 36px rgba(31,41,55,0.12)',
              border: '1px solid rgba(15,23,42,0.08)',
              overflow: 'hidden',
              marginBottom: 12,
            }}
          >
            <div style={{ height: 340, borderRadius: 14, overflow: 'hidden', background: '#0a0a1a' }}>
              {replayData ? (
                <RF3DScene replayData={replayData} playback={playback} darkMode minHeight={320} />
              ) : (
                <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
                  {loading ? '正在加载回放...' : '请选择一条回放记录'}
                </div>
              )}
            </div>
            <Space style={{ width: '100%', justifyContent: 'space-between', marginTop: 12 }}>
              <Button
                icon={playback.playing ? <PauseOutlined /> : <PlayCircleOutlined />}
                onClick={() => setPlayback(prev => ({ ...prev, playing: !prev.playing }))}
              >
                {playback.playing ? '暂停' : '播放'}
              </Button>
              <Text style={{ color: '#6b7280' }}>
                {totalFrames ? `${playback.currentFrame + 1} / ${totalFrames} 帧` : '--'}
              </Text>
              <Tag color={fallen ? 'red' : 'green'}>{fallen ? '摔倒' : '站立'}</Tag>
            </Space>
          </section>

          {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}

          <section
            style={{
              background: '#fff',
              borderRadius: 18,
              padding: 16,
              border: '1px solid rgba(15,23,42,0.08)',
              marginBottom: 12,
            }}
          >
            <Text strong style={{ color: '#111827' }}>回放列表</Text>
            <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 12 }}>
              {events.length ? events.map(item => (
                <a
                  key={item.eventId}
                  href={`#/mobile/replay?eventId=${encodeURIComponent(item.eventId)}`}
                  style={{
                    display: 'block',
                    textDecoration: 'none',
                    border: `1px solid ${item.eventId === eventId ? '#111827' : '#e5e7eb'}`,
                    borderRadius: 14,
                    padding: 12,
                    color: '#111827',
                    background: item.eventId === eventId ? '#f8fafc' : '#fff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <Text strong>{item.room || '演示房间'}</Text>
                    <Tag color={item.status === 'saved' ? 'success' : 'warning'} style={{ margin: 0 }}>
                      {item.status === 'saved' ? '已保存' : '待同步'}
                    </Tag>
                  </div>
                  <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
                    {new Date(item.timestamp * 1000).toLocaleString('zh-CN')} · {Math.round(item.confidence * 100)}%
                  </div>
                </a>
              )) : (
                <Text style={{ color: '#6b7280' }}>手机端还没有本地事件记录。</Text>
              )}
            </Space>
          </section>

          <section
            style={{
              background: '#fff',
              borderRadius: 18,
              padding: 16,
              border: '1px solid rgba(15,23,42,0.08)',
            }}
          >
            <Text strong style={{ color: '#111827' }}>模型状态</Text>
            <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 10 }}>
              <Text style={{ color: '#4b5563', fontSize: 12 }}>姿态来源：{currentWindow?.avatar?.source ?? '回放窗口'}</Text>
              <Text style={{ color: '#4b5563', fontSize: 12 }}>预测标签：{currentWindow?.avatar?.predicted_label ?? currentWindow?.label ?? '--'}</Text>
              <Text style={{ color: '#4b5563', fontSize: 12 }}>显示姿态：{fallen ? '摔倒' : '站立'}</Text>
            </Space>
          </section>
        </main>
      </div>
    </div>
  );
}
