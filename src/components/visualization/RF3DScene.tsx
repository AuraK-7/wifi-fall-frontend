import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { AvatarState } from '../../types/csi';

// ── Types ──────────────────────────────────────────────────────────
export interface FrameData { t: number; amplitude: number[]; energy?: number; variance?: number }
export interface SequenceMetadata { activity_type: string; true_label: string; total_frames_downsampled: number; amplitude_min: number; amplitude_max: number }
export interface SequenceData { metadata: SequenceMetadata; frames: FrameData[] }
export interface AnalyticsWindow { window_index: number; analytics: { micro_doppler_spectrum?: number[]; subcarrier_amplitudes?: number[]; signal_variance?: number; energy?: number; antenna_correlation?: number } | null; label?: string; avatar?: AvatarState | null }
export interface ReplayData { event_id: string; windows: AnalyticsWindow[]; start_window_index: number; centre_window_index: number }
export type NarrativePhase = 'normal' | 'walking' | 'falling' | 'alert';
export interface PlaybackState { playing: boolean; speed: number; currentFrame: number; loop: boolean; phase?: NarrativePhase }

// ── Constants ──────────────────────────────────────────────────────
const ROOM = { w: 8, d: 6, h: 3 };
const AP_POS: [number, number, number] = [0, 2.6, -ROOM.d / 2 + 0.2];
const FLOOR_Z = 0.004;
const SPEC_COLS = 128;

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
function isAvatarFallen(avatar?: AvatarState | null) {
  return avatar?.display_state === 'fallen';
}

// ── Room ───────────────────────────────────────────────────────────
function Room({ dm }: { dm: boolean }) {
  const wallColor = dm ? '#16213e' : '#d0d5e0';
  const Wall = ({ pos, size }: { pos: [number, number, number]; size: [number, number, number] }) => (
    <mesh position={pos}><boxGeometry args={size} /><meshStandardMaterial color={wallColor} transparent opacity={dm ? 0.18 : 0.12} side={THREE.DoubleSide} /></mesh>
  );
  return (
    <group>
      <Grid position={[0, FLOOR_Z + 0.001, 0]} args={[ROOM.w, ROOM.d]} cellSize={0.5} cellThickness={0.15}
        cellColor={dm ? '#334455' : '#c0c8d4'} sectionSize={2} sectionThickness={0.4}
        sectionColor={dm ? '#445566' : '#a0a8b4'} fadeDistance={20} />
      <Wall pos={[0, ROOM.h / 2, -ROOM.d / 2]} size={[ROOM.w, ROOM.h, 0.05]} />
      <Wall pos={[0, ROOM.h / 2, ROOM.d / 2]} size={[ROOM.w, ROOM.h, 0.05]} />
      <Wall pos={[-ROOM.w / 2, ROOM.h / 2, 0]} size={[0.05, ROOM.h, ROOM.d]} />
      <Wall pos={[ROOM.w / 2, ROOM.h / 2, 0]} size={[0.05, ROOM.h, ROOM.d]} />
    </group>
  );
}

// ── WiFi AP ────────────────────────────────────────────────────────
function WiFiAP() {
  return (
    <group position={AP_POS}>
      <mesh><boxGeometry args={[0.35, 0.25, 0.08]} /><meshStandardMaterial color="#334466" roughness={0.4} metalness={0.6} /></mesh>
      {[[-0.1, 0.22], [0.1, 0.22]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.12, z]}><cylinderGeometry args={[0.015, 0.015, 0.25, 8]} /><meshStandardMaterial color="#555" /></mesh>
      ))}
    </group>
  );
}

function HumanAgent({ isFall }: { isFall: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const fallTRef = useRef(0);
  const targetRef = useRef(0);

  const bodyColor = isFall ? '#ff2222' : '#3344aa';
  const ringColor = isFall ? '#ef4444' : '#22c55e';

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;

    targetRef.current = isFall ? 1 : 0;
    fallTRef.current = lerp(fallTRef.current, targetRef.current, Math.min(1, delta * 5));
    const ft = fallTRef.current;

    if (ft < 0.05) {
      groupRef.current.position.set(
        Math.sin(t * 2) * 1.2,
        0.9 + Math.abs(Math.sin(t * 1.4)) * 0.03,
        0.3,
      );
      groupRef.current.rotation.set(0, Math.sin(t * 2) > 0 ? 0.08 : -0.08, 0);
    } else {
      const y = lerp(0.9, 0.15, ft);
      const rx = lerp(0, Math.PI / 2, ft);
      const z = lerp(0.3, 0.55, ft);
      const bob = Math.sin(t * 1.4) * 0.03 * (1 - ft);
      groupRef.current.position.set(lerp(Math.sin(t * 2) * 1.2, 0, ft), y + bob, z);
      groupRef.current.rotation.set(rx, 0, 0);
    }

    if (ringRef.current) {
      const m = ringRef.current.material as THREE.MeshBasicMaterial;
      m.color.set(isFall ? '#ef4444' : '#22c55e');
      m.opacity = 0.4 + ft * 0.3;
      ringRef.current.scale.setScalar(0.95 + ft * 0.3);
      ringRef.current.rotation.z += 0.03;
    }
  });

  const emissive = isFall ? '#440000' : '#000';

  return (
    <group ref={groupRef} position={[0, 0.9, 0.3]}>
      <mesh ref={ringRef} position={[0, 1.35, 0]}><torusGeometry args={[0.20, 0.035, 16, 32]} /><meshBasicMaterial color={ringColor} transparent opacity={0.5} /></mesh>
      <mesh position={[0, 0.5, 0]}><capsuleGeometry args={[0.16, 0.7, 8, 16]} /><meshStandardMaterial color={bodyColor} roughness={0.5} emissive={emissive} emissiveIntensity={isFall ? 0.5 : 0} /></mesh>
      <mesh position={[0, 1.0, 0]}><sphereGeometry args={[0.15, 16, 16]} /><meshStandardMaterial color="#ffccaa" roughness={0.7} /></mesh>
      <mesh position={[-0.06, -0.1, 0]}><capsuleGeometry args={[0.06, 0.32, 4, 8]} /><meshStandardMaterial color="#3344aa" roughness={0.6} /></mesh>
      <mesh position={[0.06, -0.1, 0]}><capsuleGeometry args={[0.06, 0.32, 4, 8]} /><meshStandardMaterial color="#3344aa" roughness={0.6} /></mesh>
    </group>
  );
}

// ── Shockwave ──────────────────────────────────────────────────────
function ShockwaveRing({ active }: { active: boolean }) {
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (!ringRef.current || !active) return;
    ringRef.current.scale.setScalar(ringRef.current.scale.x + delta * 3);
    (ringRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.6 - ringRef.current.scale.x * 0.15);
  });
  useEffect(() => {
    if (active && ringRef.current) { ringRef.current.scale.setScalar(0.3); (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.6; }
  }, [active]);
  if (!active) return null;
  return <mesh ref={ringRef} position={[0, 0.02, 0.3]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.25, 0.35, 64]} /><meshBasicMaterial color="#ff2222" side={THREE.DoubleSide} transparent opacity={0.6} depthWrite={false} /></mesh>;
}

// ── Micro-Doppler Spectrum Floor ───────────────────────────────────
function MicroDopplerPlane({ frames, highlightIdx }: { frames: (number[] | null)[]; highlightIdx?: number }) {
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    const ROWS = frames.length || 1;
    const c = document.createElement('canvas'); c.width = SPEC_COLS; c.height = ROWS;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, SPEC_COLS, ROWS);
    let lo = -80, hi = 0;
    for (const s of frames) { if (!s) continue; for (const v of s) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    if (hi - lo < 0.5) hi = lo + 0.5;
    // 1:1 mapping: frame[i] → row[i], newest at bottom
    for (let r = 0; r < ROWS; r++) {
      const spec = frames[r];
      for (let col = 0; col < SPEC_COLS; col++) {
        const v = (spec && col < spec.length) ? spec[col] : -80;
        const t = clamp((v - lo) / (hi - lo || 1), 0, 1);
        const h = (1 - t) * 0.66, s = 0.85, l = 0.22 + t * 0.40;
        const a = s * Math.min(l, 1 - l);
        const f = (n: number) => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); };
        ctx.fillStyle = `rgb(${Math.round(f(0) * 255)},${Math.round(f(8) * 255)},${Math.round(f(4) * 255)})`;
        ctx.fillRect(col, r, 1, 1);
      }
    }
    // Highlight: current frame position
    if (highlightIdx != null && highlightIdx >= 0 && highlightIdx < ROWS) {
      ctx.strokeStyle = 'rgba(255,68,68,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, highlightIdx + 0.5); ctx.lineTo(SPEC_COLS, highlightIdx + 0.5); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    setTex(t);
    return () => { t.dispose(); };
  }, [frames, highlightIdx]);

  const pw = ROOM.w * 0.85, pd = ROOM.d * 0.65;
  return (
    <group>
      {tex && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Z + 0.005, 0]}><planeGeometry args={[pw, pd]} /><meshBasicMaterial map={tex} transparent opacity={0.92} depthWrite={false} /></mesh>}
      <Text position={[-pw / 2 - 0.25, FLOOR_Z + 0.01, -pd / 2]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} fontSize={0.08} color="#667788">频率 (Hz)</Text>
      <Text position={[0, FLOOR_Z + 0.01, -pd / 2 - 0.15]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.08} color="#667788">时间</Text>
    </group>
  );
}

// ── Scene ──────────────────────────────────────────────────────────
interface SceneProps {
  frames: (number[] | null)[];
  currentFrame: number;
  totalFrames: number;
  isFall: boolean;
  dm: boolean;
}
function SceneContent({ frames, currentFrame, totalFrames, isFall, dm }: SceneProps) {
  const specIdx = totalFrames > 0 ? clamp(currentFrame, 0, totalFrames - 1) : undefined;
  const bg = dm ? '#0a0a1a' : '#e8ecf2';
  return (
    <>
      <color attach="background" args={[bg]} />
      <ambientLight intensity={dm ? 0.35 : 0.6} color={dm ? '#404060' : '#8088a0'} />
      <pointLight position={AP_POS} intensity={dm ? 1.2 : 0.8} color="#aaccff" distance={12} />
      <directionalLight position={[5, 8, 5]} intensity={dm ? 0.4 : 0.6} />
      <Room dm={dm} />
      <MicroDopplerPlane frames={frames} highlightIdx={specIdx} />
      <WiFiAP />
      <HumanAgent isFall={isFall} />
      <ShockwaveRing active={isFall} />
      <Text position={[ROOM.w / 2 - 0.6, ROOM.h - 0.2, ROOM.d / 2 - 0.2]} fontSize={0.1} color="#8899aa" anchorX="right">{`${currentFrame + 1}/${totalFrames}`}</Text>
      <OrbitControls target={[0, 1, 0]} minDistance={2} maxDistance={20} maxPolarAngle={Math.PI * 0.85}
        enableDamping dampingFactor={0.08} autoRotate={false} />
    </>
  );
}

// ── Wrapper ────────────────────────────────────────────────────────
export interface RF3DSceneProps {
  sequence?: SequenceData | null;
  replayData?: ReplayData | null;
  playback: PlaybackState;
  darkMode?: boolean;
  fallFrameIndex?: number;
  liveAvatar?: AvatarState | null;
  minHeight?: number;
  onFrameChange?: (frame: number) => void;
  onPhaseChange?: (phase: NarrativePhase) => void;
}

export default function RF3DScene({ sequence, replayData, playback, darkMode, fallFrameIndex, liveAvatar, minHeight = 400, onFrameChange }: RF3DSceneProps) {
  const dm = darkMode ?? true;

  const specFrames = useMemo(() => {
    if (replayData) return replayData.windows.map(w => w.analytics?.micro_doppler_spectrum ?? null);
    if (sequence) return sequence.frames.map(f => f.amplitude?.length ? f.amplitude : null);
    return [] as (number[] | null)[];
  }, [replayData, sequence]);

  const total = specFrames.length;
  const cf = clamp(playback.currentFrame, 0, Math.max(0, total - 1));
  const variance = replayData
    ? (replayData.windows[cf]?.analytics?.signal_variance ?? 0.01)
    : (sequence?.frames[cf]?.variance ?? 0.01);
  const correlation = replayData
    ? (replayData.windows[cf]?.analytics?.antenna_correlation ?? 0)
    : 0;

  const currentWindow = replayData?.windows[cf];
  const currentAvatar = currentWindow?.avatar ?? liveAvatar;
  const isFall = currentAvatar
    ? isAvatarFallen(currentAvatar)
    : currentWindow
      ? currentWindow.label === 'fall'
      : cf >= (fallFrameIndex ?? 120);

  const last = useRef(-1);
  useEffect(() => { if (cf !== last.current) { last.current = cf; onFrameChange?.(cf); } }, [cf, onFrameChange]);

  return (
    <div style={{ width: '100%', height: '100%', minHeight, background: '#0a0a1a' }}>
      <Canvas camera={{ position: [8, 5, 8], fov: 50, near: 0.1, far: 50 }} gl={{ antialias: true, alpha: false }}>
        <SceneContent frames={specFrames} currentFrame={cf} totalFrames={total}
          isFall={isFall} dm={dm} />
      </Canvas>
    </div>
  );
}
