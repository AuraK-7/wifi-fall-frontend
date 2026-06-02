import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Row, Col, Card, Statistic, Table, Tag, Typography, Progress,
  Descriptions, Alert, Spin, Empty, Tooltip, Form, InputNumber,
  Button, Space, Modal, Divider, message,
} from 'antd';
import {
  ExperimentOutlined, AimOutlined, BugOutlined, WarningOutlined,
  HomeOutlined, ReloadOutlined, PlayCircleOutlined, StopOutlined,
  SettingOutlined, FileTextOutlined, ClockCircleOutlined,
  CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, UndoOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  getModelMetrics, startTraining, getTrainingStatus,
  listTrainingJobs, getTrainingLog, stopTraining, applyTraining,
} from '../api/client';
import { useAppStore } from '../store';
import { getThemeColors, fontFamily } from '../styles/tokens';
import type { ModelMetricsResponse, PerRoomMetrics, TrainingParams, TrainingJob } from '../types/csi';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

// ── Paper defaults ──────────────────────────────────────────────────────
const DEFAULT_PARAMS: TrainingParams = {
  epochs: 200, batch_size: 32, lr: 0.0005,
  p_mix: 0.3, p_shadow: 0.3, p_stretch: 0.3, p_noise: 0.3,
  weight_decay: 0.0001,
};

// ── Labels ──────────────────────────────────────────────────────────────
const ROOM_LABELS_ZH: Record<string, string> = {
  meeting_room: '会议室', lecture_room: '报告厅',
  home_lab_left: '家庭实验室(L)', home_lab_right: '家庭实验室(R)',
};
const ROOM_TYPE: Record<string, { type: string; color: string; desc: string }> = {
  meeting_room:   { type: '训练集', color: 'blue',   desc: '视距 (LOS)，训练房间' },
  lecture_room:   { type: '训练集', color: 'blue',   desc: '视距 (LOS)，训练房间' },
  home_lab_left:  { type: '验证集', color: 'orange', desc: '未见房间，新布局' },
  home_lab_right: { type: '测试集', color: 'red',    desc: '⚠ NLoS 穿墙场景' },
};

interface ComparisonRow { key: string; scenario: string; acc: string; prec: string; rec: string; f1: string; note: string; highlight?: boolean; }

const PAPER_TARGETS = {
  nlosB0: { acc: 0.78, prec: 0.66, rec: 0.95, f1: 0.78 },
  nlos2DCNN: { acc: 0.86, prec: 0.82, rec: 0.86, f1: 0.84 },
};

function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }
function colorFor(v: number, good: number, bad: number) {
  if (v >= good) return '#2ec5a2'; if (v >= bad) return '#eab54f'; return '#ef5b6b';
}
function fmtTime(iso: string | null | undefined) {
  if (!iso) return '--'; return new Date(iso).toLocaleString('zh-CN');
}
function statusTag(s: string) {
  const m: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
    running:   { color: 'processing', icon: <SyncOutlined spin />, text: '运行中' },
    pending:   { color: 'default',   icon: <ClockCircleOutlined />,  text: '等待中' },
    completed: { color: 'success',   icon: <CheckCircleOutlined />,  text: '已完成' },
    failed:    { color: 'error',     icon: <CloseCircleOutlined />,  text: '失败' },
    stopped:   { color: 'warning',   icon: <StopOutlined />,         text: '已停止' },
  };
  const v = m[s] || { color: 'default', icon: null, text: s };
  return <Tag color={v.color} icon={v.icon} style={{ fontSize: 10, lineHeight: '16px' }}>{v.text}</Tag>;
}
function NLosBadge({ precision }: { precision: number }) {
  if (precision >= 0.82) return <Tag color="green">✓ 达到论文水平 (82%+)</Tag>;
  if (precision >= 0.70) return <Tag color="orange">⚠ 接近论文 B0 (66%)</Tag>;
  return <Tag color="red">✗ 低于论文 B0 基线</Tag>;
}

// ═══════════════════════════════════════════════════════════════════════════
export default function ModelMetricsPage() {
  const dm = useAppStore(s => s.darkMode);
  const c = getThemeColors(dm);
  const ff = fontFamily.mono;

  // ── Metrics ──────────────────────────────────────────────────────────
  const [metrics, setMetrics] = useState<ModelMetricsResponse | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState('');

  // ── Training form ────────────────────────────────────────────────────
  const [form] = Form.useForm<TrainingParams>();
  const [trainingBusy, setTrainingBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState<string | null>(null); // job_id being applied

  // ── Jobs ─────────────────────────────────────────────────────────────
  const [currentJob, setCurrentJob] = useState<TrainingJob | null>(null);
  const [historyJobs, setHistoryJobs] = useState<TrainingJob[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  // ── Log modal ────────────────────────────────────────────────────────
  const [logModalJobId, setLogModalJobId] = useState<string | null>(null);
  const [logContent, setLogContent] = useState('');
  const [logLines, setLogLines] = useState(0);
  const [logLoading, setLogLoading] = useState(false);

  // ── Fetch metrics ────────────────────────────────────────────────────
  const fetchMetrics = useCallback(async () => {
    setMetricsLoading(true); setMetricsError('');
    try { const d = await getModelMetrics(); setMetrics(d); }
    catch (e) { setMetricsError(e instanceof Error ? e.message : '获取失败'); }
    finally { setMetricsLoading(false); }
  }, []);

  // ── Fetch jobs ───────────────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    try {
      const jobs = await listTrainingJobs();
      setCurrentJob(jobs.find(j => j.status === 'running' || j.status === 'pending') || null);
      setHistoryJobs(jobs.filter(j => j.status !== 'running' && j.status !== 'pending'));
      const prev = prevStatusRef.current;
      const curr = jobs.find(j => j.status === 'running' || j.status === 'pending')?.status ?? null;
      if (prev === 'running' && curr !== 'running') {
        fetchMetrics();
        const done = jobs.find(j => j.status === 'completed');
        if (done) message.success(`训练完成 (F1=${done.best_val_f1?.toFixed(3) || '?'}) — 点击「应用模型」启用`);
        else message.error('训练异常结束');
      }
      prevStatusRef.current = curr;
    } catch { /* silent */ }
  }, [fetchMetrics]);

  useEffect(() => {
    fetchMetrics(); fetchJobs();
    pollRef.current = setInterval(fetchJobs, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchMetrics, fetchJobs]);

  // ── Start training ───────────────────────────────────────────────────
  const handleStart = async () => {
    try {
      const v = await form.validateFields();
      setTrainingBusy(true);
      await startTraining(v);
      message.success('训练任务已启动');
      await fetchJobs();
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.error(msg || '启动失败');
    } finally { setTrainingBusy(false); }
  };

  // ── Stop ─────────────────────────────────────────────────────────────
  const handleStop = async () => {
    if (!currentJob) return;
    try { await stopTraining(currentJob.job_id); message.info('已停止'); await fetchJobs(); }
    catch { message.error('停止失败'); }
  };

  // ── Apply model ──────────────────────────────────────────────────────
  const handleApply = async (jobId: string) => {
    setApplyBusy(jobId);
    try {
      const r = await applyTraining(jobId);
      if (r.model_loaded) {
        message.success(`模型已应用 (F1=${r.best_val_f1?.toFixed(3) || '?'}) — 检测器已重新加载`);
      } else {
        message.warning('模型文件已复制，但检测器加载失败，请检查日志');
      }
      await fetchMetrics();
      await fetchJobs();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.error(msg || '应用失败');
    } finally { setApplyBusy(null); }
  };

  // ── Log viewer ───────────────────────────────────────────────────────
  const logPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const openLog = useCallback(async (jobId: string) => {
    setLogModalJobId(jobId); setLogLoading(true);
    try { const d = await getTrainingLog(jobId, 300); setLogContent(d.log || '(空)'); setLogLines(d.lines); }
    catch { setLogContent('[无法加载]'); setLogLines(0); }
    finally { setLogLoading(false); }
    // Auto-poll every 2s while modal is open
    if (logPollRef.current) clearInterval(logPollRef.current);
    logPollRef.current = setInterval(async () => {
      try { const d = await getTrainingLog(jobId, 300); setLogContent(d.log || '(空)'); setLogLines(d.lines); }
      catch { /* keep stale content */ }
    }, 2000);
  }, []);

  const closeLog = useCallback(() => {
    if (logPollRef.current) { clearInterval(logPollRef.current); logPollRef.current = null; }
    setLogModalJobId(null); setLogContent('');
  }, []);

  useEffect(() => {
    return () => { if (logPollRef.current) clearInterval(logPollRef.current); };
  }, []);

  const resetForm = () => form.setFieldsValue(DEFAULT_PARAMS);

  // ── Room table data ──────────────────────────────────────────────────
  const roomTableData = useMemo(() => {
    if (!metrics?.per_room_test) return [];
    return Object.entries(metrics.per_room_test).map(([room, m]) => ({
      key: room, room,
      roomZh: ROOM_LABELS_ZH[room] || room,
      roomType: ROOM_TYPE[room] || { type: '—', color: 'default', desc: '' },
      total: m.total, accuracy: m.accuracy, precision: m.precision,
      recall: m.recall, f1: m.f1,
      tn: m.tn, fp: m.fp, fn: m.fn, tp: m.tp,
      isNLoS: room.includes('right') || room.includes('(R)'),
    }));
  }, [metrics]);

  const roomColumns: ColumnsType<(typeof roomTableData)[0]> = [
    { title: '房间', dataIndex: 'roomZh', width: 140,
      render: (v: string, r) => (<span><HomeOutlined style={{ marginRight: 6, opacity: 0.5 }} /><Text style={{ fontFamily: ff, fontSize: 12 }}>{v}</Text><Text style={{ fontSize: 10, color: c.text.muted, marginLeft: 4 }}>({r.room})</Text></span>) },
    { title: '类型', dataIndex: 'roomType', width: 90,
      render: (v: (typeof roomTableData)[0]['roomType']) => (<Tooltip title={v.desc}><Tag color={v.color} style={{ fontSize: 10, lineHeight: '16px' }}>{v.type}</Tag></Tooltip>) },
    { title: '样本', dataIndex: 'total', width: 55, align: 'right', render: (v: number) => <Text style={{ fontFamily: ff, fontSize: 11 }}>{v}</Text> },
    { title: '准确率', dataIndex: 'accuracy', width: 75, align: 'right',
      render: (v: number) => <Text style={{ fontFamily: ff, fontSize: 11, color: colorFor(v, 0.90, 0.78) }}>{pct(v)}</Text> },
    { title: '精确率', dataIndex: 'precision', width: 75, align: 'right',
      render: (v: number, r) => (<span><Text style={{ fontFamily: ff, fontSize: 11, color: colorFor(v, 0.82, 0.66) }}>{pct(v)}</Text>{r.isNLoS && <Tooltip title="NLoS 精确率 — 目标 ≥82%"><WarningOutlined style={{ color: v < 0.70 ? '#ef5b6b' : '#eab54f', marginLeft: 4, fontSize: 11 }} /></Tooltip>}</span>) },
    { title: '召回率', dataIndex: 'recall', width: 75, align: 'right',
      render: (v: number) => <Text style={{ fontFamily: ff, fontSize: 11, color: colorFor(v, 0.90, 0.80) }}>{pct(v)}</Text> },
    { title: 'F1', dataIndex: 'f1', width: 75, align: 'right',
      render: (v: number) => <Text strong style={{ fontFamily: ff, fontSize: 11, color: colorFor(v, 0.88, 0.78) }}>{pct(v)}</Text> },
    { title: '混淆矩阵', key: 'cm', width: 160,
      render: (_: unknown, r) => (<span style={{ fontFamily: ff, fontSize: 10 }}><Text style={{ color: c.status.success }}>TN{r.tn}</Text>{' · '}<Text style={{ color: c.status.danger }}>FP{r.fp}</Text>{' · '}<Text style={{ color: c.status.warning }}>FN{r.fn}</Text>{' · '}<Text style={{ color: c.status.info }}>TP{r.tp}</Text></span>) },
    { title: '对比论文', key: 'paper', width: 90,
      render: (_: unknown, r) => { if (!r.isNLoS) return <Text style={{ fontSize: 10, color: c.text.muted }}>—</Text>; const d = r.precision - PAPER_TARGETS.nlos2DCNN.prec; return (<Text style={{ fontFamily: ff, fontSize: 10, color: d >= 0 ? c.status.success : c.status.danger }}>{d >= 0 ? '↑' : '↓'}{Math.abs(d * 100).toFixed(1)}pp</Text>); } },
  ];

  const testMetrics = metrics?.test;
  const nlosRoom = roomTableData.find(r => r.isNLoS);
  const nlosPrecision = nlosRoom?.precision ?? 0;

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════
  return (
    <div style={{ fontFamily: ff }}>
      {/* ═════════════════════════════════════════════════════════════
          Metrics Display
          ═════════════════════════════════════════════════════════════ */}
      {metricsLoading && !metrics && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" tip="加载模型指标..." /></div>
      )}
      {metricsError && !metrics && (
        <div style={{ padding: 12 }}><Alert type="error" message="加载失败" description={metricsError} showIcon /></div>
      )}
      {!metricsLoading && metrics?.error && (
        <div style={{ padding: 12 }}>
          <Alert type="warning" message="模型指标尚未生成" showIcon
            description={<span>{metrics.error}<br />使用下方训练控制台启动训练。</span>}
            action={<a onClick={fetchMetrics} style={{ cursor: 'pointer' }}><ReloadOutlined /> 重试</a>} />
        </div>
      )}
      {!metricsLoading && metrics && !metrics.error && (
        <>
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 13 }}>
              <ExperimentOutlined /> 模型:
              <Text strong style={{ marginLeft: 4 }}>{metrics.model || 'LightweightFallCNN'}</Text>
              <Text style={{ fontSize: 10, color: c.text.muted, marginLeft: 4 }}>
                ({((metrics.params ?? 0) / 1e6).toFixed(2)}M · epoch {metrics.best_epoch})
              </Text>
            </Text>
            <a onClick={fetchMetrics} style={{ fontSize: 11, cursor: 'pointer', marginLeft: 'auto' }}><ReloadOutlined /> 刷新</a>
          </div>
          <Row gutter={[8, 8]} style={{ marginBottom: 8 }}>
            <Col xs={6} sm={3}><Card size="small" styles={{ body: { padding: '6px 12px' } }}><Statistic title="整体准确率" value={testMetrics ? pct(testMetrics.accuracy) : '--'} valueStyle={{ fontSize: 20, color: colorFor(testMetrics?.accuracy ?? 0, 0.90, 0.78) }} /></Card></Col>
            <Col xs={6} sm={3}><Card size="small" styles={{ body: { padding: '6px 12px' } }}><Statistic title="整体精确率" value={testMetrics ? pct(testMetrics.precision) : '--'} valueStyle={{ fontSize: 20, color: colorFor(testMetrics?.precision ?? 0, 0.82, 0.66) }} /></Card></Col>
            <Col xs={6} sm={3}><Card size="small" styles={{ body: { padding: '6px 12px' } }}><Statistic title="整体召回率" value={testMetrics ? pct(testMetrics.recall) : '--'} valueStyle={{ fontSize: 20, color: colorFor(testMetrics?.recall ?? 0, 0.90, 0.80) }} /></Card></Col>
            <Col xs={6} sm={3}><Card size="small" styles={{ body: { padding: '6px 12px' } }}><Statistic title="整体 F1" value={testMetrics ? testMetrics.f1.toFixed(3) : '--'} valueStyle={{ fontSize: 20, color: colorFor(testMetrics?.f1 ?? 0, 0.88, 0.78) }} /></Card></Col>
          </Row>
          {nlosRoom && (
            <Alert type={nlosPrecision >= 0.82 ? 'success' : nlosPrecision >= 0.70 ? 'warning' : 'error'}
              message={<span><AimOutlined /> NLoS 穿墙场景精确率：<Text strong style={{ fontSize: 16, margin: '0 4px' }}>{pct(nlosPrecision)}</Text><NLosBadge precision={nlosPrecision} /></span>}
              description={<span style={{ fontSize: 11 }}>论文 B0 NLoS: 66% · 论文 2D-CNN 目标: 82%+ · 假报警: FP={nlosRoom.fp}/{nlosRoom.total} ({pct(nlosRoom.fp / nlosRoom.total)})</span>}
              style={{ marginBottom: 8 }} showIcon />
          )}
          <Card size="small" title={<span><HomeOutlined /> 分房间指标</span>} styles={{ body: { padding: 0 } }} style={{ marginBottom: 8 }}>
            <Table columns={roomColumns} dataSource={roomTableData} size="small" pagination={false} locale={{ emptyText: <Empty description="暂无数据" /> }} />
          </Card>
          <Row gutter={[8, 8]}>
            <Col xs={24} md={12}>
              <Card size="small" title={<span><ExperimentOutlined /> 论文对比</span>} styles={{ body: { padding: '6px 12px' } }}>
                <Table<ComparisonRow> size="small" pagination={false}
                  dataSource={[
                    { key: 'nlos-b0', scenario: '论文 B0 (NLoS)', acc: '78%', prec: '66%', rec: '95%', f1: '78%', note: '旧模型基线' },
                    { key: 'nlos-2dcnn', scenario: '论文 2D-CNN (NLoS)', acc: '86%', prec: '82%', rec: '86%', f1: '84%', note: '★ 目标' },
                    { key: 'ours', scenario: metrics.model || '本模型 (NLoS测试)', acc: testMetrics ? pct(testMetrics.accuracy) : '--', prec: testMetrics ? pct(testMetrics.precision) : '--', rec: testMetrics ? pct(testMetrics.recall) : '--', f1: testMetrics ? testMetrics.f1.toFixed(2) : '--', note: nlosPrecision >= 0.82 ? '✓ 达标' : nlosPrecision >= 0.70 ? '⚠ 待优化' : '✗ 需改进', highlight: true },
                  ]}
                  columns={[
                    { title: '场景', dataIndex: 'scenario', width: 160, render: (v: string, r: ComparisonRow) => <Text strong={r.highlight} style={{ fontSize: 11 }}>{v}</Text> },
                    { title: '准确率', dataIndex: 'acc', width: 55, align: 'right' as const, render: (v: string) => <Text style={{ fontFamily: ff, fontSize: 11 }}>{v}</Text> },
                    { title: '精确率', dataIndex: 'prec', width: 55, align: 'right' as const, render: (v: string) => <Text style={{ fontFamily: ff, fontSize: 11 }}>{v}</Text> },
                    { title: '召回率', dataIndex: 'rec', width: 55, align: 'right' as const, render: (v: string) => <Text style={{ fontFamily: ff, fontSize: 11 }}>{v}</Text> },
                    { title: 'F1', dataIndex: 'f1', width: 50, align: 'right' as const, render: (v: string) => <Text style={{ fontFamily: ff, fontSize: 11 }}>{v}</Text> },
                    { title: '备注', dataIndex: 'note', width: 100, render: (v: string) => <Text style={{ fontSize: 10, color: c.text.muted }}>{v}</Text> },
                  ]} />
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card size="small" title={<span><BugOutlined /> 假报警分析</span>} styles={{ body: { padding: '6px 12px' } }}>
                {roomTableData.map(r => {
                  const fpRate = r.total > 0 ? r.fp / r.total : 0;
                  return (<div key={r.key} style={{ marginBottom: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><Text style={{ fontSize: 11 }}>{r.roomZh}{r.isNLoS && <WarningOutlined style={{ color: c.status.warning, marginLeft: 4 }} />}</Text><Text style={{ fontFamily: ff, fontSize: 10, color: fpRate > 0.2 ? c.status.danger : c.text.muted }}>FP={r.fp}/{r.total} ({pct(fpRate)})</Text></div><Progress percent={fpRate * 100} size="small" showInfo={false} strokeColor={fpRate > 0.25 ? '#ef5b6b' : fpRate > 0.1 ? '#eab54f' : '#2ec5a2'} trailColor={dm ? 'rgba(142,164,189,0.1)' : 'rgba(148,163,184,0.1)'} /></div>);
                })}
                <div style={{ marginTop: 12, padding: '6px 8px', background: dm ? 'rgba(239, 91, 107, 0.06)' : 'rgba(220, 38, 38, 0.04)', borderRadius: 2 }}>
                  <Text style={{ fontSize: 10, color: c.text.muted }}><WarningOutlined /> NLoS FP 率 &gt; 25% 时建议调高该房间阈值到 0.85 或增加训练数据。</Text>
                </div>
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* ═════════════════════════════════════════════════════════════
          Training Console (replaces old "训练配置" card at bottom)
          ═════════════════════════════════════════════════════════════ */}
      <Card
        size="small"
        title={<span><SettingOutlined /> 训练模型</span>}
        style={{ marginTop: 8 }}
        styles={{ body: { padding: '10px 16px' } }}
      >
        <Form form={form} layout="inline" size="small" initialValues={DEFAULT_PARAMS}
          style={{ flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          <Form.Item name="epochs" label={<span style={{ fontSize: 10, fontFamily: ff }}>Epochs</span>}>
            <InputNumber min={50} max={300} step={10} style={{ width: 72 }} />
          </Form.Item>
          <Form.Item name="batch_size" label={<span style={{ fontSize: 10, fontFamily: ff }}>Batch</span>}>
            <InputNumber min={8} max={128} step={8} style={{ width: 68 }} />
          </Form.Item>
          <Form.Item name="lr" label={<span style={{ fontSize: 10, fontFamily: ff }}>LR</span>}>
            <InputNumber min={0.0001} max={0.01} step={0.0001} style={{ width: 90 }} />
          </Form.Item>
          <Form.Item name="p_mix" label={<span style={{ fontSize: 10, fontFamily: ff }}>p_mix</span>}>
            <InputNumber min={0} max={1} step={0.1} style={{ width: 64 }} />
          </Form.Item>
          <Form.Item name="p_shadow" label={<span style={{ fontSize: 10, fontFamily: ff }}>p_shadow</span>}>
            <InputNumber min={0} max={1} step={0.1} style={{ width: 64 }} />
          </Form.Item>
          <Form.Item name="p_stretch" label={<span style={{ fontSize: 10, fontFamily: ff }}>p_stretch</span>}>
            <InputNumber min={0} max={1} step={0.1} style={{ width: 64 }} />
          </Form.Item>
          <Form.Item name="p_noise" label={<span style={{ fontSize: 10, fontFamily: ff }}>p_noise</span>}>
            <InputNumber min={0} max={1} step={0.1} style={{ width: 64 }} />
          </Form.Item>
          <Form.Item name="weight_decay" label={<span style={{ fontSize: 10, fontFamily: ff }}>WD</span>}>
            <InputNumber min={0.00001} max={0.001} step={0.00001} style={{ width: 90 }} />
          </Form.Item>
          <Form.Item>
            <Space size={4}>
              <Button type="primary" size="small" icon={<PlayCircleOutlined />} loading={trainingBusy} disabled={!!currentJob} onClick={handleStart}>启动训练</Button>
              <Button size="small" icon={<UndoOutlined />} onClick={resetForm}>重置默认</Button>
            </Space>
          </Form.Item>
        </Form>

        {/* ── Training History (always visible, the permanent record) ── */}
        <Table<TrainingJob & { key: string }>
          size="small" pagination={false}
          dataSource={[
            ...(currentJob ? [{ ...currentJob, key: currentJob.job_id }] : []),
            ...historyJobs.map(j => ({ ...j, key: j.job_id })),
          ]}
          locale={{ emptyText: <Empty description="暂无训练记录，使用上方表单启动首次训练" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          columns={[
            { title: '任务', dataIndex: 'job_id', width: 90,
              render: (v: string) => <Text style={{ fontFamily: ff, fontSize: 10 }}>{v.slice(0, 8)}</Text> },
            { title: '状态', dataIndex: 'status', width: 85,
              render: (s: string) => statusTag(s) },
            { title: 'F1', key: 'f1', width: 65, align: 'right',
              render: (_: unknown, r: TrainingJob) => (
                <Text style={{ fontFamily: ff, fontSize: 10, color: r.best_val_f1 != null ? colorFor(r.best_val_f1, 0.80, 0.60) : c.text.muted }}>
                  {r.best_val_f1 != null ? r.best_val_f1.toFixed(3) : '--'}
                </Text>
              ) },
            { title: '参数', key: 'params', render: (_: unknown, r: TrainingJob) => (
                <Text style={{ fontSize: 9, color: c.text.muted }}>ep={r.params?.epochs} bs={r.params?.batch_size} lr={r.params?.lr} mix={r.params?.p_mix} sh={r.params?.p_shadow} wd={r.params?.weight_decay}</Text>
              ) },
            { title: '开始 / 完成', key: 'time', width: 150,
              render: (_: unknown, r: TrainingJob) => (
                <span style={{ fontSize: 9 }}>
                  <ClockCircleOutlined style={{ marginRight: 2 }} />{fmtTime(r.started_at)}
                  {r.finished_at && <><br /><CheckCircleOutlined style={{ marginRight: 2, color: c.status.success }} />{fmtTime(r.finished_at)}</>}
                </span>
              ) },
            {
              title: '操作', key: 'actions', width: 150,
              render: (_: unknown, r: TrainingJob) => (
                <Space size={2}>
                  <Button size="small" type="link" style={{ fontSize: 10, padding: 0, height: 20 }}
                    icon={<FileTextOutlined />} onClick={() => openLog(r.job_id)}>日志</Button>
                  {r.status === 'completed' && (
                    <Button size="small" type="primary" style={{ fontSize: 10, padding: '0 6px', height: 20 }}
                      icon={<ThunderboltOutlined />} loading={applyBusy === r.job_id}
                      onClick={() => handleApply(r.job_id)}>应用</Button>
                  )}
                  {r.status === 'running' && (
                    <Button size="small" danger style={{ fontSize: 10, padding: '0 6px', height: 20 }}
                      icon={<StopOutlined />} onClick={handleStop}>停止</Button>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      {/* ═════════════════════════════════════════════════════════════
          Log Modal
          ═════════════════════════════════════════════════════════════ */}
      <Modal
        title={<span><FileTextOutlined /> 训练日志 — {logModalJobId} <SyncOutlined spin style={{ marginLeft: 8, opacity: 0.45 }} /></span>}
        open={!!logModalJobId}
        onCancel={closeLog}
        footer={[
          <Button key="refresh" size="small" loading={logLoading} onClick={() => logModalJobId && openLog(logModalJobId)}>立即刷新</Button>,
          <Button key="close" size="small" onClick={closeLog}>关闭</Button>,
        ]}
        width={800}
      >
        {logLoading ? <Spin /> : (
          <pre style={{ display: 'flex', flexDirection: 'column-reverse', maxHeight: 480, overflow: 'auto', fontSize: 10, fontFamily: ff, background: dm ? '#0a1220' : '#f5f7fa', color: dm ? '#8ea4bd' : '#334155', padding: 10, borderRadius: 2, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{logContent.split('\n').reverse().join('\n')}</pre>
        )}
        <div style={{ marginTop: 4, fontSize: 10, color: c.text.muted }}>{logLines} 行 · 每 2s 自动刷新</div>
      </Modal>
    </div>
  );
}
