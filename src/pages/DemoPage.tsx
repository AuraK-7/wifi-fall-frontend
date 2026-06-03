import { useState, useCallback, useMemo } from 'react';
import { Card, Button, Select, Input, Typography, Statistic, Tag, App, Space } from 'antd';
import { SendOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useAppStore } from '../store';
import { apiClient } from '../api/client';
import { getThemeColors } from '../styles/tokens';
import SubcarrierStackChart from '../components/charts/SubcarrierStackChart';

const { Text } = Typography;

/* ── Scene presets ──────────────────────────────────────────────── */
const SCENES = [
  { label: '客厅',       value: 'living_room' },
  { label: 'Home Lab',   value: 'home_lab' },
  { label: '会议室',     value: 'meeting_room' },
  { label: '教室',       value: 'lecture_room' },
  { label: '全部场景',   value: 'all' },
];

/* ── Types ──────────────────────────────────────────────────────── */
interface TriggerResult {
  frame: Record<string, unknown>;
  result: {
    predicted_label: string;
    confidence: number;
    risk_level: string;
    alert: boolean;
    reason: string;
    activity_score: number;
    timestamp: number;
    room: string;
  };
  alert_saved: boolean;
  event_id: string | null;
  sample_index: number;
  total_samples: number;
  true_label: string;
  evidence_chain?: { window_index: number; analytics?: { subcarrier_amplitudes?: number[] } | null }[];
}

interface SubData { subcarrier_amplitudes?: number[]; frame_id?: number }

/* ═════════════════════════════════════════════════════════════════
   LEFT PANEL
   ═════════════════════════════════════════════════════════════════ */
function ControlPanel({
  scene, setScene, sampleIdx, setSampleIdx,
  loading, lastResult, subData, c, onTrigger,
}: {
  scene: string; setScene: (v: string) => void;
  sampleIdx: number; setSampleIdx: (v: number) => void;
  loading: boolean; lastResult: TriggerResult | null;
  subData: SubData[];
  c: ReturnType<typeof getThemeColors>;
  onTrigger: () => void;
}) {
  return (
    <div style={{
      width: 450, flexShrink: 0, overflow: 'auto', padding: '12px 14px',
      borderRight: `1px solid ${c.border.default}`, height: '100vh',
      fontFamily: `"IBM Plex Sans SC", "Source Han Sans CN", sans-serif`,
    }}>
      <Card size="small" title={<Text strong style={{ color: c.text.primary }}>控制面板</Text>}
        styles={{ body: { padding: '14px' } }} style={{ marginBottom: 12 }}>
        {/* Scene */}
        <div style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: c.text.secondary, display: 'block', marginBottom: 6 }}>
            ENetFall 场景
          </Text>
          <Select value={scene} onChange={(v) => { setScene(v); setSampleIdx(0); }}
            style={{ width: '100%' }}
            options={SCENES.map((s) => ({ value: s.value, label: s.label }))} />
        </div>

        {/* Sample index */}
        <div style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 12, color: c.text.secondary, display: 'block', marginBottom: 6 }}>
            样本编号
          </Text>
          <Space>
            <Input type="number" min={0} value={sampleIdx}
              onChange={(e) => setSampleIdx(Math.max(0, parseInt(e.target.value) || 0))}
              style={{ width: 100, fontFamily: 'monospace' }} size="small" />
            <Button size="small" onClick={() => setSampleIdx(sampleIdx + 1)} icon={<ReloadOutlined />}>
              下一个
            </Button>
          </Space>
          <Text style={{ fontSize: 11, color: c.text.muted, display: 'block', marginTop: 4 }}>
            取 ENetFall [3,625,30] 窗口，EfficientNet‑B0 推理
          </Text>
        </div>

        <Button type="primary" size="large" icon={<SendOutlined />}
          onClick={onTrigger} loading={loading} block
          style={{ height: 44, fontSize: 15, fontWeight: 600 }}>
          发送并推理
        </Button>
      </Card>

      {/* ── Subcarrier signal chart ────────────────────────── */}
      {subData.length > 0 && (
        <Card size="small" styles={{ body: { padding: '6px' } }} style={{ marginBottom: 12 }}>
          <SubcarrierStackChart height={200} data={subData} />
        </Card>
      )}

      {/* Result card */}
      <Card size="small" title={<Text strong style={{ color: c.text.primary }}>最近一次推理结果</Text>}
        styles={{ body: { padding: '14px' } }}>
        {lastResult ? <ResultDisplay data={lastResult} c={c} /> : (
          <div style={{ textAlign: 'center', padding: '30px 0', color: c.text.muted }}>
            <ThunderboltOutlined style={{ fontSize: 32, display: 'block', margin: '0 auto 10px', opacity: 0.3 }} />
            <Text style={{ color: c.text.muted, fontSize: 12 }}>点击「发送并推理」</Text>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   PHONE SIMULATOR
   ═════════════════════════════════════════════════════════════════ */
function PhoneSimulator({ darkMode }: { darkMode: boolean }) {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      background: darkMode
        ? 'radial-gradient(ellipse at center, #111520 0%, #0a0c12 100%)'
        : 'radial-gradient(ellipse at center, #e8ecf2 0%, #d0d5e0 100%)',
      minHeight: '100vh',
    }}>
      <div style={{
        width: 412, height: 850, maxHeight: '94vh',
        background: '#1a1a1a', borderRadius: 36, padding: 12,
        boxShadow: '0 0 0 2px #333, 0 0 0 4px #1a1a1a, 0 20px 60px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ width: 100, height: 24, background: '#1a1a1a', borderRadius: '0 0 16px 16px', margin: '0 auto 6px' }} />
        <div style={{ flex: 1, borderRadius: 24, overflow: 'hidden' }}>
          <iframe src="/#/phone-view" title="Mobile" scrolling="no"
            style={{ width: '100%', height: '100%', border: 'none', overflow: 'hidden' }} />
        </div>
        <div style={{ width: 90, height: 4, background: '#444', borderRadius: 2, margin: '6px auto 0' }} />
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   MAIN
   ═════════════════════════════════════════════════════════════════ */
export default function DemoPage() {
  const { notification } = App.useApp();
  const darkMode = useAppStore((s) => s.darkMode);
  const c = getThemeColors(darkMode);

  const [scene, setScene] = useState('living_room');
  const [sampleIdx, setSampleIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<TriggerResult | null>(null);

  const subData = useMemo<SubData[]>(() => {
    if (!lastResult?.evidence_chain) return [];
    return lastResult.evidence_chain.map((w) => ({
      subcarrier_amplitudes: w.analytics?.subcarrier_amplitudes,
      frame_id: w.window_index,
    }));
  }, [lastResult]);

  const handleTrigger = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.post<TriggerResult>('/api/demo/trigger', {
        scene, sample_index: sampleIdx,
        room: 'demo', device_id: 'demo-node',
        evidence_before: 40, evidence_after: 20,
      });
      setLastResult(data);
      notification[data.result.alert ? 'success' : 'info']({
        message: data.result.alert
          ? '推理完成 — ⚠ 检测到跌倒！'
          : `推理完成 — 真实标签: ${data.true_label}`,
        description: `ENetFall B0 · 置信度 ${(data.result.confidence * 100).toFixed(0)}% · 已推送到右侧移动端`,
        placement: 'top', duration: 3,
      });
    } catch (err) {
      notification.error({
        message: '推理失败',
        description: err instanceof Error ? err.message : '请确认后端已启动',
        placement: 'top', duration: 5,
      });
    } finally { setLoading(false); }
  }, [scene, sampleIdx, notification]);

  return (
    <div style={{ display: 'flex', height: '100vh', margin: -6 }}>
      <ControlPanel
        scene={scene} setScene={setScene}
        sampleIdx={sampleIdx} setSampleIdx={setSampleIdx}
        loading={loading} lastResult={lastResult} subData={subData} c={c}
        onTrigger={handleTrigger}
      />
      <PhoneSimulator darkMode={darkMode} />
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   RESULT DISPLAY
   ═════════════════════════════════════════════════════════════════ */
function ResultDisplay({ data, c }: { data: TriggerResult; c: ReturnType<typeof getThemeColors> }) {
  const r = data.result;
  return (
    <div>
      <div style={{ marginBottom: 12, textAlign: 'center' }}>
        <Tag color={r.alert ? 'red' : 'green'}
          style={{ fontSize: 15, padding: '5px 18px', borderRadius: 20 }}>
          {r.alert ? '⚠ 检测到跌倒' : '✓ 未检测到跌倒'}
        </Tag>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
        <Statistic title="置信度" value={(r.confidence * 100).toFixed(1)} suffix="%"
          valueStyle={{ color: r.confidence > 0.75 ? c.status.danger : c.status.success, fontSize: 22 }} />
        <Statistic title="活跃分数" value={r.activity_score.toFixed(3)}
          valueStyle={{ color: r.activity_score > 0.5 ? c.status.warning : c.text.muted }} />
        <div>
          <Text style={{ fontSize: 12, color: c.text.secondary }}>预测标签</Text><br />
          <Tag color={r.predicted_label === 'fall' ? 'red' : 'blue'}>{r.predicted_label}</Tag>
        </div>
        <div>
          <Text style={{ fontSize: 12, color: c.text.secondary }}>真实标签</Text><br />
          <Tag color={data.true_label === 'fall' ? 'red' : 'green'}>{data.true_label}</Tag>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <Text style={{ fontSize: 12, color: c.text.secondary }}>判定理由</Text>
        <Text style={{ fontSize: 11, color: c.text.muted, display: 'block', marginTop: 2 }}>{r.reason}</Text>
      </div>
      <div style={{
        marginTop: 10, padding: '6px 10px', background: c.bg.surface, borderRadius: 6,
        display: 'flex', gap: 16, fontSize: 11, color: c.text.muted,
      }}>
        <span>样本: {data.sample_index} / {data.total_samples}</span>
        <span>告警已保存: {data.alert_saved ? '是' : '否'}</span>
      </div>
    </div>
  );
}
