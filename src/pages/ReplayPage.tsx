import { useCallback, useEffect, useRef, useState } from 'react';
import { getAvailableLabels, getSequence } from '../api/client';
import NarrativeControls from '../components/visualization/NarrativeControls';
import RF3DScene, {
  type NarrativePhase,
  type PlaybackState,
  type SequenceData,
} from '../components/visualization/RF3DScene';
import StoryTimeline, { buildPhaseSegments } from '../components/visualization/StoryTimeline';
import type { AvailableLabel } from '../types/csi';

const ACTIVITY_OPTIONS = [
  { value: 'fall', label: '摔倒 (Fall)' },
  { value: 'walk', label: '行走 (Walk)' },
  { value: 'normal', label: '日常 (Normal)' },
  { value: 'run', label: '跑步 (Run)' },
  { value: 'lie_down', label: '躺下 (Lie Down)' },
  { value: 'sit_down', label: '坐下 (Sit Down)' },
  { value: 'stand_up', label: '站起 (Stand Up)' },
];

const DOWNSAMPLE_STEP = 4;

export default function NarrativePage() {
  const [labels, setLabels] = useState<AvailableLabel[]>([]);
  const [sequence, setSequence] = useState<SequenceData | null>(null);
  const [sequenceRight, setSequenceRight] = useState<SequenceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activityType, setActivityType] = useState('fall');
  const [sampleIndex, setSampleIndex] = useState(0);
  const [maxSampleIdx, setMaxSampleIdx] = useState(0);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [playback, setPlayback] = useState<PlaybackState>({
    playing: false, speed: 1, currentFrame: 0, phase: 'normal', loop: true,
  });
  const prevPhaseRef = useRef<NarrativePhase>('normal');

  // Load labels
  useEffect(() => {
    getAvailableLabels()
      .then((data) => setLabels(data.labels))
      .catch(() => setError('无法加载活动标签列表，请确认后端已启动'));
  }, []);

  const loadSequence = useCallback(async (type: string, idx: number): Promise<SequenceData | null> => {
    try {
      const data = await getSequence(type, idx, DOWNSAMPLE_STEP);
      if (data.metadata?.total_samples_of_type) {
        setMaxSampleIdx(data.metadata.total_samples_of_type - 1);
      }
      return data as SequenceData;
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载序列失败');
      return null;
    }
  }, []);

  const loadBoth = useCallback(async (type: string, idx: number, compare: boolean) => {
    setLoading(true);
    setError('');
    setPlayback((prev) => ({ ...prev, currentFrame: 0, playing: false, phase: 'normal' }));
    const left = await loadSequence(type, idx);
    setSequence(left);

    if (compare) {
      // Right side: walk if left is fall, else fall
      const rightType = type === 'fall' ? 'walk' : 'fall';
      const right = await loadSequence(rightType, 0);
      setSequenceRight(right);
    } else {
      setSequenceRight(null);
    }
    setLoading(false);
  }, [loadSequence]);

  useEffect(() => {
    loadBoth(activityType, sampleIndex, comparisonMode);
  }, [activityType, sampleIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when comparison mode toggles
  useEffect(() => {
    loadBoth(activityType, sampleIndex, comparisonMode);
  }, [comparisonMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalFrames = sequence?.frames.length ?? 0;
  const phases = buildPhaseSegments(activityType, totalFrames);

  const handlePlaybackChange = useCallback((update: Partial<PlaybackState>) => {
    setPlayback((prev) => {
      const next = { ...prev, ...update };
      if (!next.loop && next.currentFrame >= totalFrames - 1) {
        next.currentFrame = Math.max(0, totalFrames - 1);
        next.playing = false;
      }
      return next;
    });
  }, [totalFrames]);

  const handlePhaseChange = useCallback((phase: NarrativePhase) => {
    setPlayback((prev) => (prev.phase !== phase ? { ...prev, phase } : prev));
  }, []);

  const handleSeekToPhase = useCallback((phase: NarrativePhase) => {
    const seg = phases.find((s) => s.phase === phase);
    if (seg) {
      handlePlaybackChange({ currentFrame: Math.round(seg.startRatio * (totalFrames - 1)), phase });
    }
  }, [phases, totalFrames, handlePlaybackChange]);

  const handleTimelineSeek = useCallback((frame: number) => {
    handlePlaybackChange({ currentFrame: frame, playing: false });
  }, [handlePlaybackChange]);

  return (
    <div className="narrative-page">
      <header className="narrative-header">
        <h2>3D 叙事可视化 — UT-HAR 摔倒检测</h2>
        <p className="narrative-subtitle">
          基于 CSI 信号的 3D 场景重建 · 数据驱动的连续动画 · 帧间平滑插值
          {comparisonMode && ' · 对比模式'}
        </p>
      </header>

      {/* Toolbar */}
      <div className="narrative-toolbar">
        <div className="toolbar-group">
          <label className="toolbar-label">活动类型:</label>
          <select value={activityType} onChange={(e) => { setActivityType(e.target.value); setSampleIndex(0); }} disabled={loading}>
            {ACTIVITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {!comparisonMode && (
          <div className="toolbar-group">
            <label className="toolbar-label">样本:</label>
            <input type="number" min={0} max={maxSampleIdx} value={sampleIndex}
              onChange={(e) => setSampleIndex(Math.max(0, Math.min(maxSampleIdx, Number(e.target.value))))}
              disabled={loading} style={{ width: 80 }} />
            <span className="toolbar-hint">/ {maxSampleIdx}</span>
          </div>
        )}

        {/* Comparison mode toggle */}
        <div className="toolbar-group">
          <label className="comparison-checkbox">
            <input type="checkbox" checked={comparisonMode}
              onChange={(e) => setComparisonMode(e.target.checked)} disabled={loading} />
            <span>对比模式 (摔倒 vs 行走)</span>
          </label>
        </div>

        <button type="button" className="toolbar-btn" disabled={loading}
          onClick={() => loadBoth(activityType, sampleIndex, comparisonMode)}>
          {loading ? '加载中...' : '重新加载'}
        </button>

        {/* Phase quick-jump */}
        {!comparisonMode && activityType === 'fall' && (
          <div className="toolbar-group" style={{ marginLeft: 8, borderLeft: '1px solid #e2e8f0', paddingLeft: 16 }}>
            <span className="toolbar-label" style={{ fontSize: 12 }}>跳转:</span>
            {(['normal', 'walking', 'falling', 'alert'] as NarrativePhase[]).map((p) => (
              <button key={p} type="button" className="speed-btn" disabled={!sequence}
                onClick={() => handleSeekToPhase(p)}
                style={{ background: playback.phase === p ? '#2563eb' : '#e2e8f0', color: playback.phase === p ? '#fff' : '#475569' }}>
                {p === 'normal' ? '平静' : p === 'walking' ? '行走' : p === 'falling' ? '摔倒' : '警报'}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="narrative-error"><p>{error}</p></div>}

      {loading && (
        <div className="narrative-loading">
          <div className="loading-spinner" />
          <span>加载序列数据... {comparisonMode ? '(加载两份样本)' : ''}</span>
        </div>
      )}

      {/* 3D Scene - taller for comparison mode */}
      <div className="narrative-scene-container" style={comparisonMode ? { height: 560 } : undefined}>
        <RF3DScene
          sequence={sequence}
          sequenceRight={comparisonMode ? sequenceRight : undefined}
          playback={playback}
          onFrameChange={(frame) => handlePlaybackChange({ currentFrame: frame })}
          onPhaseChange={handlePhaseChange}
        />
      </div>

      {/* Timeline - only in single mode */}
      {!comparisonMode && (
        <StoryTimeline phases={phases} currentFrame={playback.currentFrame}
          totalFrames={totalFrames} onSeek={handleTimelineSeek}
          onPhaseClick={handleSeekToPhase} disabled={!sequence} />
      )}

      {/* Controls */}
      <NarrativeControls playback={playback} onPlaybackChange={handlePlaybackChange}
        phase={playback.phase} disabled={!sequence} />

      {/* Readout */}
      {sequence && (
        <div className="narrative-readout">
          {comparisonMode ? (
            <>
              <span>左: <strong>{sequence.metadata.true_label}</strong> ({sequence.metadata.total_frames_downsampled}帧)</span>
              <span>右: <strong>{sequenceRight?.metadata.true_label ?? '--'}</strong> ({sequenceRight?.metadata.total_frames_downsampled ?? '--'}帧)</span>
              <span>帧: <strong>{playback.currentFrame}</strong></span>
              <span>阶段: <strong style={{ color: playback.phase === 'alert' ? '#dc2626' : '#16a34a' }}>{playback.phase}</strong></span>
            </>
          ) : (
            <>
              <span>标签: <strong>{sequence.metadata.true_label}</strong></span>
              <span>帧: <strong>{playback.currentFrame}/{totalFrames - 1}</strong> ({sequence.metadata.total_frames_raw}→{sequence.metadata.total_frames_downsampled})</span>
              <span>能量: <strong>{sequence.frames[playback.currentFrame]?.energy?.toFixed(2) ?? '--'}</strong></span>
              <span>阶段: <strong style={{ color: playback.phase === 'alert' ? '#dc2626' : playback.phase === 'falling' ? '#ea580c' : '#16a34a' }}>{playback.phase}</strong></span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
