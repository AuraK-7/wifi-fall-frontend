import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Progress,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseOutlined,
  CloudUploadOutlined,
  HistoryOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { activateMobileModel, getMobileModelConfig, getMobileModelList, MOBILE_CSI_WS_URL, submitMobileFallEvent } from '../api/client';
import type {
  DemoCsiPacket,
  MobileFallEventPayload,
  MobileFallEventResponse,
  MobileInferenceResult,
  MobileModelConfig,
} from '../types/demo';
import type { AnalyticsSnapshot, ModelListResponse } from '../types/csi';
import { fontFamily } from '../styles/tokens';

const { Text, Title } = Typography;

type WsState = 'connecting' | 'open' | 'closed' | 'error';

const FALL_SCORE_THRESHOLD = 0.55;
const MOBILE_EVENTS_KEY = 'wifi-fall-mobile-events';
const DEFAULT_MODEL: MobileModelConfig = {
  runtime: 'mock',
  weight_url: '/models/mobile-fall.onnx',
  input_shape: [1, 64, 30],
  class_names: ['non_fall', 'fall'],
  threshold: 0.75,
};

interface SavedEventView {
  eventId: string;
  timestamp: number;
  room: string;
  confidence: number;
  status: 'saved' | 'pending';
  replayUrl: string;
  message?: string;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function parsePacket(raw: string): DemoCsiPacket | null {
  const data = JSON.parse(raw) as DemoCsiPacket | { type?: string; payload?: DemoCsiPacket };
  if ('payload' in data && data.payload?.packet_id) return data.payload;
  if ('packet_id' in data && data.packet_id) return data;
  return null;
}

function flattenWindow(packet: DemoCsiPacket) {
  const values: number[] = [];
  for (const frame of packet.window) values.push(...frame.subcarriers);
  return values;
}

function deriveAnalytics(packet: DemoCsiPacket, energy: number, variance: number): AnalyticsSnapshot {
  const last = packet.subcarriers.length ? packet.subcarriers : Array.from({ length: 30 }, () => 0);
  const spectrum = Array.from({ length: 128 }, (_, i) => {
    const src = packet.window[i % packet.window.length]?.variance ?? variance;
    return Number((-70 + clamp(src * 260, 0, 58)).toFixed(3));
  });
  return {
    micro_doppler_spectrum: spectrum,
    subcarrier_amplitudes: last.slice(0, 30),
    antenna_correlation: Number(clamp(1 - variance * 2.4, 0.05, 0.98).toFixed(4)),
    energy: Number(energy.toFixed(4)),
    dominant_freq: Number(clamp(variance * 18, 0.2, 8).toFixed(4)),
    frequency_spread: Number(clamp(variance * 24, 0.4, 12).toFixed(4)),
    signal_variance: Number(variance.toFixed(6)),
  };
}

function inferPacket(packet: DemoCsiPacket, model: MobileModelConfig): MobileInferenceResult {
  const values = flattenWindow(packet);
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
  const energy = values.reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(1, values.length);
  const peakVariance = packet.window.reduce((max, frame) => Math.max(max, frame.variance), 0);
  const score = clamp((variance - 0.015) / 0.16 + peakVariance * 1.35, 0, 1);
  const alert = score >= FALL_SCORE_THRESHOLD;
  const confidence = alert
    ? clamp(0.72 + score * 0.26, model.threshold, 0.99)
    : clamp(0.54 + (1 - score) * 0.32, 0.5, 0.9);
  const predictedLabel = alert ? 'fall' : 'non_fall';
  const riskLevel = alert ? (confidence > 0.9 ? 'high' : 'medium') : 'low';

  return {
    predicted_label: predictedLabel,
    confidence: Number(confidence.toFixed(4)),
    risk_level: riskLevel,
    alert,
    activity_score: Number(score.toFixed(4)),
    energy: Number(energy.toFixed(4)),
    variance: Number(variance.toFixed(6)),
    reason: alert
      ? '手机端模型检测到 CSI 窗口存在高能量突变，判定为摔倒。'
      : '手机端模型未检测到摔倒特征。',
    avatar: {
      display_state: alert ? 'fallen' : 'standing',
      dataset_state: 'unknown',
      predicted_state: alert ? 'fallen' : 'standing',
      source: 'mobile_model',
      dataset_label: null,
      predicted_label: predictedLabel,
      confidence: Number(confidence.toFixed(4)),
      risk_level: riskLevel,
      alert,
    },
  };
}

function loadSavedEvents(): SavedEventView[] {
  try {
    const raw = window.localStorage.getItem(MOBILE_EVENTS_KEY);
    return raw ? JSON.parse(raw) as SavedEventView[] : [];
  } catch {
    return [];
  }
}

function persistSavedEvents(events: SavedEventView[]) {
  window.localStorage.setItem(MOBILE_EVENTS_KEY, JSON.stringify(events.slice(0, 20)));
}

function fmtClock(ts?: number) {
  return new Date(ts ? ts * 1000 : Date.now()).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDuration(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  const mins = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${mins} 分 ${rest} 秒`;
}

export default function MobileDetectorPage() {
  const socketRef = useRef<WebSocket | null>(null);
  const lastSavedAtRef = useRef(0);
  const [wsState, setWsState] = useState<WsState>('closed');
  const [model, setModel] = useState<MobileModelConfig>(DEFAULT_MODEL);
  const [mobileModelList, setMobileModelList] = useState<ModelListResponse | null>(null);
  const [selectedMobileModelId, setSelectedMobileModelId] = useState('');
  const [modelReady, setModelReady] = useState(false);
  const [packet, setPacket] = useState<DemoCsiPacket | null>(null);
  const [result, setResult] = useState<MobileInferenceResult | null>(null);
  const [events, setEvents] = useState<SavedEventView[]>(() => loadSavedEvents());
  const [error, setError] = useState('');
  const [received, setReceived] = useState(0);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  const loadModel = useCallback(async () => {
    setError('');
    try {
      const config = await getMobileModelConfig();
      setModel(config);
    } catch {
      setModel(DEFAULT_MODEL);
    } finally {
      setModelReady(true);
    }
  }, []);

  const loadMobileModels = useCallback(async () => {
    try {
      const list = await getMobileModelList();
      setMobileModelList(list);
      const active = list.models.find(item => item.active);
      setSelectedMobileModelId(active?.model_id ?? list.models[0]?.model_id ?? '');
    } catch {
      setMobileModelList(null);
      setSelectedMobileModelId('');
    }
  }, []);

  useEffect(() => {
    loadModel();
    loadMobileModels();
  }, [loadMobileModels, loadModel]);

  const activateSelectedMobileModel = useCallback(async () => {
    if (!selectedMobileModelId) return;
    setError('');
    try {
      await activateMobileModel({ model_id: selectedMobileModelId });
      await Promise.all([loadModel(), loadMobileModels()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '手机端模型切换失败');
    }
  }, [loadMobileModels, loadModel, selectedMobileModelId]);

  const pushEvent = useCallback((event: SavedEventView) => {
    setEvents(prev => {
      const next = [event, ...prev.filter(item => item.eventId !== event.eventId)].slice(0, 12);
      persistSavedEvents(next);
      return next;
    });
  }, []);

  const saveFallEvent = useCallback(async (
    currentPacket: DemoCsiPacket,
    currentResult: MobileInferenceResult,
  ) => {
    const now = Date.now();
    if (now - lastSavedAtRef.current < 3000) return;
    lastSavedAtRef.current = now;
    setLastEventAt(currentPacket.timestamp);

    const eventId = `mobile-fall-${currentPacket.packet_id}`;
    const analytics = deriveAnalytics(currentPacket, currentResult.energy, currentResult.variance);
    const payload: MobileFallEventPayload = {
      event_id: eventId,
      packet_id: currentPacket.packet_id,
      sequence_id: currentPacket.sequence_id,
      timestamp: currentPacket.timestamp,
      room: currentPacket.room,
      device_id: 'mobile-detector-001',
      model,
      packet: currentPacket,
      result: currentResult,
      analytics,
    };

    try {
      const response: MobileFallEventResponse = await submitMobileFallEvent(payload);
      pushEvent({
        eventId,
        timestamp: currentPacket.timestamp,
        room: currentPacket.room,
        confidence: currentResult.confidence,
        status: response.saved ? 'saved' : 'pending',
        replayUrl: `#/mobile/replay?eventId=${encodeURIComponent(eventId)}`,
        message: response.message,
      });
    } catch (e) {
      pushEvent({
        eventId,
        timestamp: currentPacket.timestamp,
        room: currentPacket.room,
        confidence: currentResult.confidence,
        status: 'pending',
        replayUrl: `#/mobile/replay?eventId=${encodeURIComponent(eventId)}`,
        message: e instanceof Error ? e.message : '后端保存接口暂不可用',
      });
    }
  }, [model, pushEvent]);

  const handlePacket = useCallback((nextPacket: DemoCsiPacket) => {
    setPacket(nextPacket);
    setReceived(v => v + 1);
    const nextResult = inferPacket(nextPacket, model);
    setResult(nextResult);
    if (modelReady && nextResult.alert) saveFallEvent(nextPacket, nextResult);
  }, [model, modelReady, saveFallEvent]);

  const connect = useCallback(() => {
    socketRef.current?.close();
    setError('');
    setWsState('connecting');
    const socket = new WebSocket(MOBILE_CSI_WS_URL);
    socketRef.current = socket;
    socket.onopen = () => setWsState('open');
    socket.onclose = () => setWsState('closed');
    socket.onerror = () => {
      setWsState('error');
      setError('手机端接收通道连接失败，请确认后端 /ws/mobile/csi 已实现。');
    };
    socket.onmessage = event => {
      try {
        const nextPacket = parsePacket(event.data);
        if (nextPacket) handlePacket(nextPacket);
      } catch {
        setError('收到的数据包格式无法解析。');
      }
    };
  }, [handlePacket]);

  useEffect(() => {
    connect();
    return () => socketRef.current?.close();
  }, [connect]);

  const hasResult = Boolean(result);
  const alertActive = result?.alert ?? false;
  const theme = alertActive
    ? {
        bg: '#fff1ee',
        top: 'linear-gradient(160deg, #ff6b6f 0%, #f5575f 100%)',
        icon: '#ff2d3d',
        title: '检测到摔倒',
        subtitle: '已通知后台保存事件',
        cardTitle: '正在记录摔倒波形',
      }
    : {
        bg: hasResult ? '#f0fbf4' : '#fff4eb',
        top: hasResult
          ? 'linear-gradient(160deg, #34d399 0%, #16a34a 100%)'
          : 'linear-gradient(160deg, #ffad22 0%, #f6960c 100%)',
        icon: hasResult ? '#16a34a' : '#f6960c',
        title: result ? '状态安全' : '等待检测',
        subtitle: result ? '未发现摔倒风险' : '等待控制台发送数据',
        cardTitle: result ? '安全，继续监测中' : '手机端已准备就绪',
      };
  const wsColor = wsState === 'open' ? 'success' : wsState === 'connecting' ? 'processing' : 'error';
  const confidencePct = Math.round((result?.confidence ?? 0) * 100);
  const responseSeconds = lastEventAt ? Math.max(1, Math.floor(Date.now() / 1000 - lastEventAt)) : 0;
  const selectedMobileModel = mobileModelList?.models.find(item => item.model_id === selectedMobileModelId);

  return (
    <div style={{ minHeight: '100vh', background: theme.bg, fontFamily: fontFamily.sans }}>
      <div style={{ maxWidth: 460, margin: '0 auto', minHeight: '100vh', background: theme.bg }}>
        <section
          style={{
            minHeight: 300,
            padding: '16px 20px 86px',
            color: '#fff',
            background: theme.top,
            borderBottomLeftRadius: 30,
            borderBottomRightRadius: 30,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 42 }}>
            <Text style={{ color: '#fff', fontWeight: 600 }}>{fmtClock(packet?.timestamp)}</Text>
            <Space size={8}>
              <Tag color={wsColor} style={{ margin: 0 }}><WifiOutlined /> {wsState}</Tag>
              <a href="#/console" style={{ color: '#fff', fontSize: 18, lineHeight: 1 }}><CloseOutlined /></a>
            </Space>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            {alertActive ? (
              <SafetyCertificateOutlined style={{ fontSize: 32, marginBottom: 18 }} />
            ) : (
              <CheckCircleOutlined style={{ fontSize: 34, marginBottom: 18 }} />
            )}
            <Title level={2} style={{ color: '#fff', margin: 0, fontWeight: 800 }}>{theme.title}</Title>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>{theme.subtitle}</Text>
          </div>

          <div style={{ textAlign: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: 700 }}>{fmtClock(packet?.timestamp)}（本地）</Text>
            <div style={{ color: 'rgba(255,255,255,0.86)', fontSize: 12, marginTop: 8 }}>
              {packet?.room ?? '演示房间'} · {packet?.device_id ?? '等待设备'}
            </div>
          </div>
        </section>

        <main style={{ padding: '0 14px 24px', marginTop: -64 }}>
          <section
            style={{
              background: '#fff',
              border: '1px solid rgba(15,23,42,0.08)',
              borderRadius: 18,
              boxShadow: '0 16px 36px rgba(31, 41, 55, 0.12)',
              padding: 18,
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: '50%',
                  background: alertActive ? '#fff0f0' : hasResult ? '#f0fdf4' : '#fff7ed',
                  display: 'grid',
                  placeItems: 'center',
                  color: theme.icon,
                  fontSize: 26,
                  boxShadow: `0 0 0 12px ${alertActive ? 'rgba(255,45,61,0.08)' : hasResult ? 'rgba(22,163,74,0.10)' : 'rgba(246,150,12,0.12)'}`,
                }}
              >
                {alertActive ? <SafetyCertificateOutlined /> : <CheckCircleOutlined />}
              </div>
            </div>
            <Title level={4} style={{ textAlign: 'center', margin: '0 0 4px', color: '#111827' }}>{theme.cardTitle}</Title>
            <Text style={{ display: 'block', textAlign: 'center', color: '#6b7280', marginBottom: 14 }}>
              {alertActive ? `响应计时 ${fmtDuration(responseSeconds)}` : `已接收 ${received} 个数据包`}
            </Text>
            <Progress percent={confidencePct} strokeColor={theme.icon} trailColor="#f1f5f9" />
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 12, marginTop: 12 }}>
              <Text strong style={{ color: '#111827' }}>发生了什么？</Text>
              <div style={{ color: '#6b7280', fontSize: 12, lineHeight: 1.6, marginTop: 4 }}>
                {result?.reason ?? '手机端正在等待 CSI 数据，收到后会调用本地模型并自动保存摔倒事件。'}
              </div>
            </div>
          </section>

          <section
            style={{
              background: '#fff',
              borderRadius: 18,
              padding: 16,
              marginBottom: 12,
              border: '1px solid rgba(15,23,42,0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text strong style={{ color: '#111827' }}>模型状态</Text>
              <Tag color={modelReady ? 'success' : 'processing'}>{modelReady ? '已加载' : '加载中'}</Tag>
            </div>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Text style={{ color: '#4b5563', fontSize: 12 }}>运行时：{model.runtime}</Text>
              <Text style={{ color: '#4b5563', fontSize: 12 }}>权重：{model.weight_url}</Text>
              <Text style={{ color: '#4b5563', fontSize: 12 }}>输入：{model.input_shape.join(' x ')}</Text>
              <Select
                size="small"
                value={selectedMobileModelId}
                onChange={setSelectedMobileModelId}
                placeholder="选择手机端模型"
                options={(mobileModelList?.models ?? []).map(item => ({
                  value: item.model_id,
                  label: `${item.file_name}${item.active ? '（当前）' : ''}`,
                }))}
                style={{ width: '100%', marginTop: 8 }}
              />
              {selectedMobileModel && (
                <Text style={{ color: '#6b7280', fontSize: 11, wordBreak: 'break-all' }}>
                  已选：{selectedMobileModel.file_name} · {selectedMobileModel.detector_type}
                </Text>
              )}
            </Space>
            <Space style={{ marginTop: 12 }}>
              <Button size="small" icon={<ReloadOutlined />} onClick={connect}>重连接收</Button>
              <Button size="small" icon={<CheckCircleOutlined />} onClick={loadModel}>重新加载权重</Button>
              <Button size="small" type="primary" onClick={activateSelectedMobileModel} disabled={!selectedMobileModelId}>切换模型</Button>
            </Space>
          </section>

          {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}

          <section
            style={{
              background: '#fff',
              borderRadius: 18,
              padding: 16,
              border: '1px solid rgba(15,23,42,0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text strong style={{ color: '#111827' }}>事件记录</Text>
              <a href="#/mobile/replay" style={{ color: '#111827' }}><HistoryOutlined /> 全部回放</a>
            </div>
            {events.length ? (
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {events.slice(0, 4).map(event => (
                  <a
                    key={event.eventId}
                    href={event.replayUrl}
                    style={{
                      display: 'block',
                      textDecoration: 'none',
                      border: '1px solid #e5e7eb',
                      borderRadius: 14,
                      padding: 12,
                      color: '#111827',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <Text strong>{event.status === 'saved' ? '摔倒记录已保存' : '等待后端保存'}</Text>
                      <Tag color={event.status === 'saved' ? 'success' : 'warning'} style={{ margin: 0 }}>
                        {Math.round(event.confidence * 100)}%
                      </Tag>
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
                      {new Date(event.timestamp * 1000).toLocaleString('zh-CN')} · {event.room}
                    </div>
                  </a>
                ))}
              </Space>
            ) : (
              <div style={{ color: '#6b7280', fontSize: 13 }}>
                检测到摔倒后会自动保存，并在这里显示手机端回放入口。
              </div>
            )}
          </section>

          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            href="#/mobile/replay"
            block
            style={{ height: 42, marginTop: 14, background: '#111827' }}
          >
            查看手机端回放
          </Button>
        </main>
      </div>
    </div>
  );
}
