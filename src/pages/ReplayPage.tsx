import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAvailableLabels, getSequence, getEventReplay } from '../api/client';
import { useAppStore } from '../store';
import RF3DScene, {
  type NarrativePhase, type PlaybackState, type ReplayData, type SequenceData,
} from '../components/visualization/RF3DScene';
import SubcarrierStackChart from '../components/charts/SubcarrierStackChart';
import AntennaCorrelationChart from '../components/charts/AntennaCorrelationChart';
import StoryTimeline, { buildPhaseSegments } from '../components/visualization/StoryTimeline';
import type { AvailableLabel, EventReplayResponse } from '../types/csi';

const SPEEDS = [0.25, 0.5, 1, 2];

export default function NarrativePage() {
  const dm = useAppStore(s => s.darkMode);
  const liveAvatar = useAppStore(s => s.latestMessage?.avatar ?? null);
  const [sequence, setSequence] = useState<SequenceData | null>(null);
  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventError, setEventError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playback, setPlayback] = useState<PlaybackState>({
    playing: false, speed: 1, currentFrame: 0, loop: true, phase: 'normal' as NarrativePhase,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace('#/replay', '').replace('#', ''));
    const eid = params.get('eventId');
    if (eid) {
      setEventId(eid);
      setEventLoading(true); setEventError('');
      getEventReplay(eid).then((data: EventReplayResponse) => {
        setReplayData({
          event_id: data.event_id, windows: data.windows,
          start_window_index: data.start_window_index, centre_window_index: data.centre_window_index,
        });
        setPlayback(prev => ({ ...prev, playing: true, currentFrame: 0 }));
        setEventLoading(false);
      }).catch((err: Error) => { setEventError(err.message || '加载失败'); setEventLoading(false); });
    }
  }, []);

  // Demo data
  const demoFrames = 160, demoFallStart = 120;
  const demoData: ReplayData = useMemo(() => ({
    event_id: 'demo',
    windows: Array.from({ length: demoFrames }, (_, i) => ({
      window_index: i, analytics: null,
      label: i < demoFallStart ? 'non_fall' : 'fall', room: 'demo',
    })),
    start_window_index: 0, centre_window_index: demoFallStart,
  }), []);

  const fallFrameIndex = useMemo(() => {
    if (!replayData) return demoFallStart;
    return replayData.windows.findIndex(w => w.label === 'fall');
  }, [replayData]);

  const subcarrierData = useMemo(() => replayData?.windows.map(w => ({
    subcarrier_amplitudes: w.analytics?.subcarrier_amplitudes,
    frame_id: w.window_index,
  })) ?? [], [replayData]);
  const corrData = useMemo(() => replayData?.windows.map(w => ({
    antenna_correlation: w.analytics?.antenna_correlation,
    frame_id: w.window_index,
  })) ?? [], [replayData]);

  // Auto-play demo
  useEffect(() => {
    if (!eventId && !sequence) setPlayback(prev => ({ ...prev, playing: true, currentFrame: 0 }));
  }, [eventId, sequence]);

  // Playback loop
  const timerRef = useRef<number | null>(null);
  const plRef = useRef(playback);
  plRef.current = playback;
  const rdRef = useRef(replayData);
  rdRef.current = replayData;
  const ddRef = useRef(demoData);
  ddRef.current = demoData;

  useEffect(() => {
    const kick = () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      const rd = rdRef.current, dd = ddRef.current, pl = plRef.current;
      const total = rd?.windows.length || dd.windows.length;
      if (pl.playing && total > 0) {
        timerRef.current = window.setInterval(() => {
          setPlayback(prev => {
            const t = rdRef.current?.windows.length || ddRef.current.windows.length;
            return { ...prev, currentFrame: prev.currentFrame + 1 >= t ? 0 : prev.currentFrame + 1 };
          });
        }, 100 / pl.speed);
      }
    };
    kick();
    return () => { if (timerRef.current != null) window.clearInterval(timerRef.current); };
  }, []);

  // Sync interval on play/speed change
  useEffect(() => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    const rd = rdRef.current, dd = ddRef.current, pl = plRef.current;
    const total = rd?.windows.length || dd.windows.length;
    if (pl.playing && total > 0) {
      timerRef.current = window.setInterval(() => {
        setPlayback(prev => {
          const t = rdRef.current?.windows.length || ddRef.current.windows.length;
          return { ...prev, currentFrame: prev.currentFrame + 1 >= t ? 0 : prev.currentFrame + 1 };
        });
      }, 100 / pl.speed);
    } else {
      timerRef.current = null;
    }
  }, [playback.playing, playback.speed]);

  // ── Event replay mode ────────────────────────────────────────────
  if (eventId) {
    const total = replayData?.windows.length ?? 0;
    const hlId = replayData?.windows[playback.currentFrame]?.window_index;
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {eventLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}><div className="loading-spinner" /></div>}
        {eventError && <div style={{ fontSize: 11, color: '#94a3b8', padding: '4px 8px', fontFamily: 'monospace' }}>{eventError}</div>}
        {replayData && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <RF3DScene replayData={replayData} playback={playback} darkMode={dm}
                liveAvatar={liveAvatar}
                fallFrameIndex={fallFrameIndex}
                onFrameChange={f => setPlayback(p => p.currentFrame !== f ? { ...p, currentFrame: f } : p)} />
            </div>
            {/* Subcarrier stack — top left */}
            <div style={{ position: 'absolute', top: 8, left: 8, width: 320, height: 150, background: dm ? 'rgba(10,14,24,0.75)' : 'rgba(255,255,255,0.75)', zIndex: 5 }}>
              <SubcarrierStackChart height={150} data={subcarrierData} highlightFrameId={hlId} />
            </div>
            {/* Correlation — top right */}
            <div style={{ position: 'absolute', top: 8, right: 8, width: 280, height: 120, background: dm ? 'rgba(10,14,24,0.75)' : 'rgba(255,255,255,0.75)', zIndex: 5 }}>
              <AntennaCorrelationChart height={120} data={corrData} highlightFrameId={hlId} />
            </div>
            {/* Bottom bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', flexShrink: 0, borderTop: `1px solid ${dm ? '#1a2a3a' : '#e5e7eb'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setPlayback(p => ({ ...p, playing: !p.playing }))}
                  style={{ background: 'transparent', border: 'none', color: dm ? '#e2e8f0' : '#334455', fontSize: 14, cursor: 'pointer', fontFamily: 'monospace', lineHeight: 1 }}>
                  {playback.playing ? '⏸' : '▶'}
                </button>
                <span style={{ fontSize: 11, color: dm ? '#8899aa' : '#556677', fontFamily: 'monospace' }}>事件 · {eventId.slice(0, 8)}</span>
                <span style={{ fontSize: 11, color: dm ? '#8899aa' : '#556677', fontFamily: 'monospace' }}>帧</span>
                <input type="number" min={1} max={total} value={playback.currentFrame + 1}
                  onChange={e => { const v = parseInt(e.target.value) || 1; setPlayback(p => ({ ...p, currentFrame: Math.max(0, Math.min(total - 1, v - 1)), playing: false })); }}
                  onKeyDown={e => { if (e.key === 'Enter') { const v = parseInt((e.target as HTMLInputElement).value) || 1; setPlayback(p => ({ ...p, currentFrame: Math.max(0, Math.min(total - 1, v - 1)), playing: false })); } }}
                  style={{ width: 50, background: 'transparent', border: `1px solid ${dm ? '#334455' : '#ccd'}`, color: dm ? '#e2e8f0' : '#334455', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', padding: '1px 4px' }} />
                <span style={{ fontSize: 11, color: dm ? '#8899aa' : '#556677', fontFamily: 'monospace' }}>/ {total}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {SPEEDS.map(s => (
                  <button key={s} onClick={() => setPlayback(p => ({ ...p, speed: s }))}
                    style={{ background: playback.speed === s ? 'rgba(74,168,255,0.2)' : 'transparent', border: 'none', color: playback.speed === s ? '#4aa8ff' : dm ? '#667788' : '#8899aa', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace', padding: '2px 6px' }}>{s}x</button>
                ))}
                <button onClick={() => setPlayback(p => ({ ...p, loop: !p.loop }))}
                  style={{ background: 'transparent', border: 'none', color: playback.loop ? '#4aa8ff' : dm ? '#556677' : '#8899aa', fontSize: 11, cursor: 'pointer', marginLeft: 4 }}>
                  {playback.loop ? '🔁' : '➡'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Demo mode ────────────────────────────────────────────────────
  if (!eventId && !sequence && !loading) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <RF3DScene replayData={demoData} playback={playback} darkMode={dm}
            liveAvatar={liveAvatar}
            fallFrameIndex={demoFallStart}
            onFrameChange={f => setPlayback(p => p.currentFrame !== f ? { ...p, currentFrame: f } : p)} />
        </div>
        {!playback.playing && (
          <button onClick={() => setPlayback(p => ({ ...p, playing: true }))}
            style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
              background: 'rgba(74,168,255,0.12)', border: '2px solid #4aa8ff', color: '#e2e8f0',
              fontSize: 40, width: 80, height: 80, cursor: 'pointer', fontFamily: 'monospace',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>▶</button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', flexShrink: 0, borderTop: `1px solid ${dm ? '#1a2a3a' : '#e5e7eb'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setPlayback(p => ({ ...p, playing: !p.playing }))}
              style={{ background: 'transparent', border: 'none', color: dm ? '#e2e8f0' : '#334455', fontSize: 14, cursor: 'pointer', fontFamily: 'monospace' }}>
              {playback.playing ? '⏸' : '▶'}
            </button>
            <span style={{ fontSize: 11, color: dm ? '#8899aa' : '#556677', fontFamily: 'monospace' }}>演示 · 行走→摔倒 · 帧 {playback.currentFrame + 1}/{demoFrames}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {SPEEDS.map(s => (
              <button key={s} onClick={() => setPlayback(p => ({ ...p, speed: s }))}
                style={{ background: playback.speed === s ? 'rgba(74,168,255,0.2)' : 'transparent', border: 'none', color: playback.speed === s ? '#4aa8ff' : dm ? '#667788' : '#8899aa', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace', padding: '2px 6px' }}>{s}x</button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Offline sequence mode ────────────────────────────────────────
  const totalFrames = sequence?.frames.length ?? 0;
  const phases = buildPhaseSegments('fall', totalFrames);
  const handlePlaybackChange = useCallback((update: Partial<PlaybackState>) => {
    setPlayback(prev => { const next = { ...prev, ...update }; if (!next.loop && next.currentFrame >= totalFrames - 1) { next.currentFrame = totalFrames - 1; next.playing = false; } return next; });
  }, [totalFrames]);
  const handlePhaseChange = useCallback((phase: NarrativePhase) => { setPlayback(prev => prev.phase !== phase ? { ...prev, phase } : prev); }, []);
  const handleTimelineSeek = useCallback((frame: number) => { handlePlaybackChange({ currentFrame: frame, playing: false }); }, [handlePlaybackChange]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {error && <div style={{ fontSize: 11, color: '#94a3b8', padding: '4px 8px', fontFamily: 'monospace' }}>{error}</div>}
      {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}><div className="loading-spinner" /></div>}
      <div style={{ flex: 1, minHeight: 0 }}>
        <RF3DScene sequence={sequence} playback={playback} darkMode={dm}
          liveAvatar={liveAvatar}
          onFrameChange={f => handlePlaybackChange({ currentFrame: f })} onPhaseChange={handlePhaseChange} />
      </div>
      <StoryTimeline phases={phases} currentFrame={playback.currentFrame} totalFrames={totalFrames}
        onSeek={handleTimelineSeek}
        onPhaseClick={p => { const seg = phases.find(s => s.phase === p); if (seg) handlePlaybackChange({ currentFrame: Math.round(seg.startRatio * (totalFrames - 1)), phase: p }); }}
        disabled={!sequence} />
    </div>
  );
}
