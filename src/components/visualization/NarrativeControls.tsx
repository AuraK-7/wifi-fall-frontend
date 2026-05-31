import type { NarrativePhase, PlaybackState } from './RF3DScene';

interface NarrativeControlsProps {
  playback: PlaybackState;
  onPlaybackChange: (update: Partial<PlaybackState>) => void;
  phase: NarrativePhase;
  disabled: boolean;
}

const PHASE_LABELS: Record<NarrativePhase, { zh: string; color: string }> = {
  normal: { zh: '平静', color: '#44cc44' },
  walking: { zh: '行走', color: '#ffcc00' },
  falling: { zh: '摔倒', color: '#ff6600' },
  alert: { zh: '警报', color: '#ff2222' },
};

const SPEEDS = [0.25, 0.5, 1, 2];

export default function NarrativeControls({ playback, onPlaybackChange, phase, disabled }: NarrativeControlsProps) {
  const phaseInfo = PHASE_LABELS[phase];

  return (
    <div className="narrative-controls">
      <div className="narrative-phase-indicator" style={{ borderColor: phaseInfo.color }}>
        <span className="phase-dot" style={{ background: phaseInfo.color }} />
        <span className="phase-label">{phaseInfo.zh}</span>
      </div>

      <div className="narrative-buttons">
        <button
          type="button"
          className="ctrl-btn"
          disabled={disabled}
          onClick={() => onPlaybackChange({ currentFrame: 0, playing: false })}
          title="跳转到开头"
        >
          ⏮
        </button>
        <button
          type="button"
          className="ctrl-btn"
          disabled={disabled}
          onClick={() => onPlaybackChange({ currentFrame: Math.max(0, playback.currentFrame - 1), playing: false })}
          title="上一帧"
        >
          ◀
        </button>
        <button
          type="button"
          className="ctrl-btn ctrl-btn--primary"
          disabled={disabled}
          onClick={() => onPlaybackChange({ playing: !playback.playing })}
          title={playback.playing ? '暂停' : '播放'}
        >
          {playback.playing ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          className="ctrl-btn"
          disabled={disabled}
          onClick={() => onPlaybackChange({ currentFrame: playback.currentFrame + 1, playing: false })}
          title="下一帧"
        >
          ▶
        </button>
        <button
          type="button"
          className="ctrl-btn"
          disabled={disabled}
          onClick={() => onPlaybackChange({ playing: false, loop: !playback.loop })}
          title={playback.loop ? '循环播放中' : '单次播放'}
        >
          {playback.loop ? '🔁' : '➡'}
        </button>
      </div>

      <div className="narrative-speed">
        <span className="speed-label">速度:</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={`speed-btn${playback.speed === s ? ' speed-btn--active' : ''}`}
            disabled={disabled}
            onClick={() => onPlaybackChange({ speed: s })}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
