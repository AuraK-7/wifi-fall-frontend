import type { NarrativePhase, PlaybackState } from './RF3DScene';

interface Props {
  playback: PlaybackState;
  onPlaybackChange: (update: Partial<PlaybackState>) => void;
  phase?: NarrativePhase;
  disabled?: boolean;
}

const SPEEDS = [0.25, 0.5, 1, 2];

export default function NarrativeControls({ playback, onPlaybackChange, disabled }: Props) {
  const btn: React.CSSProperties = {
    background: 'transparent', border: 'none', color: '#8899aa', cursor: 'pointer',
    fontSize: 13, padding: '2px 6px', fontFamily: 'monospace', lineHeight: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 0, minWidth: 24,
  };
  const active: React.CSSProperties = { ...btn, color: '#4aa8ff', fontWeight: 'bold' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
      {/* Transport */}
      <button style={btn} disabled={disabled} onClick={() => onPlaybackChange({ currentFrame: 0, playing: false })} title="开头">⏮</button>
      <button style={btn} disabled={disabled} onClick={() => onPlaybackChange({ currentFrame: Math.max(0, playback.currentFrame - 1), playing: false })} title="上一帧">◀</button>
      <button style={{ ...btn, fontSize: 16, color: '#e2e8f0' }} disabled={disabled}
        onClick={() => onPlaybackChange({ playing: !playback.playing })} title={playback.playing ? '暂停' : '播放'}>
        {playback.playing ? '⏸' : '▶'}
      </button>
      <button style={btn} disabled={disabled} onClick={() => onPlaybackChange({ currentFrame: playback.currentFrame + 1, playing: false })} title="下一帧">▶</button>

      {/* Speed */}
      <span style={{ color: '#556677', fontSize: 10, fontFamily: 'monospace' }}>·</span>
      {SPEEDS.map(s => (
        <button key={s} style={playback.speed === s ? active : btn} disabled={disabled}
          onClick={() => onPlaybackChange({ speed: s })}>{s}x</button>
      ))}

      {/* Loop */}
      <span style={{ color: '#556677', fontSize: 10, fontFamily: 'monospace' }}>·</span>
      <button style={playback.loop ? active : btn} disabled={disabled}
        onClick={() => onPlaybackChange({ loop: !playback.loop })}
        title={playback.loop ? '循环中' : '单次'}>{playback.loop ? '🔁' : '➡'}</button>
    </div>
  );
}
