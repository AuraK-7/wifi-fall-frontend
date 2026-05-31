import type { NarrativePhase } from './RF3DScene';

interface PhaseSegment {
  phase: NarrativePhase;
  label: string;
  color: string;
  startRatio: number; // 0..1
  endRatio: number;   // 0..1
}

interface StoryTimelineProps {
  phases: PhaseSegment[];
  currentFrame: number;
  totalFrames: number;
  onSeek: (frame: number) => void;
  onPhaseClick?: (phase: NarrativePhase) => void;
  disabled: boolean;
}

export default function StoryTimeline({ phases, currentFrame, totalFrames, onSeek, onPhaseClick, disabled }: StoryTimelineProps) {
  const progress = totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0;

  return (
    <div className="story-timeline">
      <div className="timeline-track">
        {phases.map((seg, i) => {
          const left = seg.startRatio * 100;
          const width = (seg.endRatio - seg.startRatio) * 100;
          return (
            <div
              key={i}
              className="timeline-segment"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: seg.color,
              }}
              title={`${seg.label} (${Math.round(seg.startRatio * totalFrames)}–${Math.round(seg.endRatio * totalFrames)})`}
            />
          );
        })}

        <div
          className="timeline-progress-indicator"
          style={{ left: `${progress}%` }}
        />

        <input
          type="range"
          className="timeline-slider"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          step={1}
          value={currentFrame}
          disabled={disabled}
          onChange={(e) => onSeek(Number(e.target.value))}
        />
      </div>

      <div className="timeline-labels">
        {phases.map((seg, i) => (
          <button
            key={i}
            type="button"
            className="timeline-phase-label"
            style={{
              left: `${((seg.startRatio + seg.endRatio) / 2) * 100}%`,
              color: seg.color,
            }}
            disabled={disabled}
            onClick={() => onPhaseClick?.(seg.phase)}
          >
            {seg.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Build phase segments based on activity type */
export function buildPhaseSegments(
  activityType: string,
  totalFrames: number,
): PhaseSegment[] {
  if (totalFrames === 0) return [];

  if (activityType === 'fall') {
    return [
      { phase: 'normal', label: '平静', color: '#44cc44', startRatio: 0, endRatio: 0.3 },
      { phase: 'walking', label: '行走', color: '#ffcc00', startRatio: 0.3, endRatio: 0.55 },
      { phase: 'falling', label: '摔倒', color: '#ff6600', startRatio: 0.55, endRatio: 0.75 },
      { phase: 'alert', label: '警报', color: '#ff2222', startRatio: 0.75, endRatio: 1 },
    ];
  }

  if (activityType === 'walk') {
    return [
      { phase: 'normal', label: '平静', color: '#44cc44', startRatio: 0, endRatio: 0.15 },
      { phase: 'walking', label: '行走', color: '#ffcc00', startRatio: 0.15, endRatio: 0.85 },
      { phase: 'normal', label: '平静', color: '#44cc44', startRatio: 0.85, endRatio: 1 },
    ];
  }

  // Default: single normal segment
  return [
    { phase: 'normal', label: '平静', color: '#44cc44', startRatio: 0, endRatio: 1 },
  ];
}
