import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Descriptions, Input, InputNumber, Row, Select, Space, Statistic, Tag, Typography } from 'antd';
import { ApiOutlined, PlayCircleOutlined, PauseOutlined, SendOutlined, ReloadOutlined } from '@ant-design/icons';
import { DEMO_SOURCE_WS_URL, postDemoPacket } from '../api/client';
import type { DemoCsiPacket, DemoPacketAck } from '../types/demo';
import { useAppStore } from '../store';
import { getThemeColors, fontFamily } from '../styles/tokens';

const { Text } = Typography;

type WsState = 'connecting' | 'open' | 'closed' | 'error';
type Scenario = 'normal' | 'fall_burst' | 'random';

const SUBCARRIER_COUNT = 30;
const WINDOW_SIZE = 64;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function makePacket(params: {
  scenario: Scenario;
  sequenceId: string;
  frameId: number;
  room: string;
  deviceId: string;
  mode: 'single' | 'stream';
}): DemoCsiPacket {
  const now = Date.now();
  const effectiveScenario: Exclude<Scenario, 'random'> =
    params.scenario === 'random'
      ? (Math.random() >= 0.5 ? 'fall_burst' : 'normal')
      : params.scenario;
  const burstStart = Math.floor(WINDOW_SIZE * 0.62);
  const window = Array.from({ length: WINDOW_SIZE }, (_, frameIndex) => {
    const fallPhase = effectiveScenario === 'fall_burst' && frameIndex >= burstStart;
    const t = params.frameId + frameIndex;
    const base = fallPhase ? 0.78 : 0.2;
    const swing = fallPhase ? 0.42 : 0.08;
    const subcarriers = Array.from({ length: SUBCARRIER_COUNT }, (_, carrier) => {
      const carrierWave = Math.sin(t * 0.18 + carrier * 0.35) * swing;
      const bodyWave = Math.cos(t * 0.07 + carrier * 0.11) * (fallPhase ? 0.22 : 0.04);
      const noise = (Math.random() - 0.5) * (fallPhase ? 0.22 : 0.04);
      return Number(clamp(base + carrierWave + bodyWave + noise, -1.2, 1.8).toFixed(4));
    });
    const mean = subcarriers.reduce((sum, value) => sum + value, 0) / subcarriers.length;
    const variance = subcarriers.reduce((sum, value) => sum + (value - mean) ** 2, 0) / subcarriers.length;
    const energy = subcarriers.reduce((sum, value) => sum + Math.abs(value), 0) / subcarriers.length;
    return {
      frame_index: frameIndex,
      timestamp: (now + frameIndex * 20) / 1000,
      subcarriers,
      energy: Number(energy.toFixed(4)),
      variance: Number(variance.toFixed(5)),
    };
  });

  const latest = window[window.length - 1];
  return {
    packet_id: `pkt-${now}-${params.frameId}`,
    sequence_id: params.sequenceId,
    frame_id: params.frameId,
    timestamp: now / 1000,
    room: params.room,
    device_id: params.deviceId,
    source: 'console',
    mode: params.mode,
    subcarrier_count: SUBCARRIER_COUNT,
    window_size: WINDOW_SIZE,
    subcarriers: latest.subcarriers,
    window,
  };
}

export default function DemoConsolePage() {
  const darkMode = useAppStore(s => s.darkMode);
  const c = getThemeColors(darkMode);
  const socketRef = useRef<WebSocket | null>(null);
  const frameRef = useRef(0);
  const lastPacketIdRef = useRef('--');
  const [wsState, setWsState] = useState<WsState>('closed');
  const [room, setRoom] = useState('demo_room');
  const [deviceId, setDeviceId] = useState('console-csi-001');
  const [scenario, setScenario] = useState<Scenario>('fall_burst');
  const [fps, setFps] = useState(4);
  const [streaming, setStreaming] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [fallbackCount, setFallbackCount] = useState(0);
  const [lastPacket, setLastPacket] = useState<DemoCsiPacket | null>(null);
  const [lastAck, setLastAck] = useState<DemoPacketAck | null>(null);
  const [error, setError] = useState('');
  const sequenceId = useMemo(() => `seq-${Date.now().toString(36)}`, []);

  const connect = useCallback(() => {
    socketRef.current?.close();
    setWsState('connecting');
    setError('');
    const socket = new WebSocket(DEMO_SOURCE_WS_URL);
    socketRef.current = socket;
    socket.onopen = () => setWsState('open');
    socket.onclose = () => setWsState('closed');
    socket.onerror = () => {
      setWsState('error');
      setError('控制台发送通道连接失败，将在发送时尝试 REST 兜底接口。');
    };
    socket.onmessage = event => {
      try {
        setLastAck(JSON.parse(event.data) as DemoPacketAck);
      } catch {
        setLastAck({ accepted: true, packet_id: lastPacketIdRef.current, message: String(event.data) });
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => socketRef.current?.close();
  }, [connect]);

  const sendPacket = useCallback(async (mode: 'single' | 'stream') => {
    const packet = makePacket({
      scenario,
      sequenceId,
      frameId: frameRef.current,
      room,
      deviceId,
      mode,
    });
    frameRef.current += WINDOW_SIZE;
    setLastPacket(packet);
    lastPacketIdRef.current = packet.packet_id;

    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'demo_csi_packet', payload: packet }));
      setSentCount(v => v + 1);
      return;
    }

    try {
      const ack = await postDemoPacket(packet);
      setLastAck(ack);
      setSentCount(v => v + 1);
      setFallbackCount(v => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败');
    }
  }, [deviceId, room, scenario, sequenceId]);

  useEffect(() => {
    if (!streaming) return;
    const interval = window.setInterval(() => {
      sendPacket('stream');
    }, Math.max(100, 1000 / fps));
    return () => window.clearInterval(interval);
  }, [fps, sendPacket, streaming]);

  const stateColor = wsState === 'open' ? 'success' : wsState === 'connecting' ? 'processing' : 'error';

  return (
    <div style={{ fontFamily: fontFamily.mono }}>
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={8}>
          <Card size="small" title="演示控制台" extra={<Tag color={stateColor}>{wsState}</Tag>}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Alert
                type="info"
                showIcon
                message="发送给手机端的数据包不包含 label 字段"
                description="页面上的场景选择只用于生成演示波形，真正发出的 payload 只包含 CSI 窗口、房间、设备和时间。"
              />
              <Input addonBefore="房间" value={room} onChange={e => setRoom(e.target.value)} />
              <Input addonBefore="设备" value={deviceId} onChange={e => setDeviceId(e.target.value)} />
              <Select
                value={scenario}
                onChange={setScenario}
                options={[
                  { value: 'fall_burst', label: '摔倒波形样本' },
                  { value: 'normal', label: '正常活动样本' },
                  { value: 'random', label: '随机样本（正常/摔倒）' },
                ]}
              />
              <InputNumber
                min={1}
                max={20}
                value={fps}
                addonBefore="发送 FPS"
                onChange={v => setFps(Number(v ?? 4))}
                style={{ width: '100%' }}
              />
              <Space wrap>
                <Button icon={<ReloadOutlined />} onClick={connect}>重连通道</Button>
                <Button icon={<SendOutlined />} onClick={() => sendPacket('single')}>发送单包</Button>
                <Button
                  type={streaming ? 'default' : 'primary'}
                  icon={streaming ? <PauseOutlined /> : <PlayCircleOutlined />}
                  onClick={() => setStreaming(v => !v)}
                >
                  {streaming ? '停止流式发送' : '开始流式发送'}
                </Button>
              </Space>
              {error && <Text type="danger">{error}</Text>}
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Row gutter={[12, 12]}>
            <Col xs={8}><Card size="small"><Statistic title="已发送" value={sentCount} /></Card></Col>
            <Col xs={8}><Card size="small"><Statistic title="REST 兜底" value={fallbackCount} /></Card></Col>
            <Col xs={8}><Card size="small"><Statistic title="窗口帧数" value={WINDOW_SIZE} /></Card></Col>
          </Row>
          <Card size="small" style={{ marginTop: 12 }} title={<Space><ApiOutlined />接口契约</Space>}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="控制台发送 WS">{DEMO_SOURCE_WS_URL}</Descriptions.Item>
              <Descriptions.Item label="REST 兜底">POST /api/demo/packets</Descriptions.Item>
              <Descriptions.Item label="手机端接收">ws://127.0.0.1:8000/ws/mobile/csi</Descriptions.Item>
              <Descriptions.Item label="事件保存">POST /api/mobile/fall-events</Descriptions.Item>
            </Descriptions>
          </Card>
          <Card size="small" style={{ marginTop: 12 }} title="最近发送 payload 摘要">
            {lastPacket ? (
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: c.text.secondary }}>
{JSON.stringify({
  packet_id: lastPacket.packet_id,
  sequence_id: lastPacket.sequence_id,
  frame_id: lastPacket.frame_id,
  timestamp: lastPacket.timestamp,
  room: lastPacket.room,
  device_id: lastPacket.device_id,
  subcarrier_count: lastPacket.subcarrier_count,
  window_size: lastPacket.window_size,
  has_label: Object.prototype.hasOwnProperty.call(lastPacket, 'label'),
}, null, 2)}
              </pre>
            ) : (
              <Text type="secondary">还没有发送数据包。</Text>
            )}
          </Card>
          {lastAck && (
            <Card size="small" style={{ marginTop: 12 }} title="最近 ACK">
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: c.text.secondary }}>
                {JSON.stringify(lastAck, null, 2)}
              </pre>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
