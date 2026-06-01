import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Text, Html } from '@react-three/drei';
import * as THREE from 'three';

// ── Types ──────────────────────────────────────────────────────────

export interface FrameData {
  t: number; amplitude: number[]; energy?: number; variance?: number;
}
export interface SequenceMetadata {
  activity_type: string; true_label: string; true_label_id?: number;
  sample_index?: number; total_samples_of_type?: number;
  total_frames_raw: number; total_frames_downsampled: number;
  downsample_step?: number; subcarrier_count?: number;
  amplitude_min: number; amplitude_max: number; amplitude_mean: number; amplitude_std: number;
}
export interface SequenceData { metadata: SequenceMetadata; frames: FrameData[]; }
export type NarrativePhase = 'normal' | 'walking' | 'falling' | 'alert';
export interface PlaybackState {
  playing: boolean; speed: number; currentFrame: number;
  phase: NarrativePhase; loop: boolean;
}

// ── Constants ──────────────────────────────────────────────────────

const ROOM = { w: 8, d: 6, h: 3 };
const AP_POS: [number, number, number] = [0, 2.6, -ROOM.d / 2 + 0.1];
const SUBCARRIER_COUNT = 90;
const POINT_COLS = 10; const POINT_ROWS = 9;
const BASE_FRAME_DURATION = 1 / 8;
const PHASE_BOUNDS: Record<string, number[]> = {
  fall: [0, 0.3, 0.55, 0.75, 1.0],
  walk: [0, 0.15, 0.85, 1.0],
  run: [0, 0.15, 0.85, 1.0],
};

// ── Math ───────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

// ── Texture generation ─────────────────────────────────────────────

function createWoodTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#c8a87c';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) {
    const y = i * 13 + Math.sin(i * 0.7) * 6;
    ctx.strokeStyle = `rgba(139,90,43,${0.15 + Math.random() * 0.2})`;
    ctx.lineWidth = 1.5 + Math.random() * 3;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y + (Math.random() - 0.5) * 20); ctx.stroke();
  }
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(100,60,30,${0.05 + Math.random() * 0.08})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── Point cloud helpers ────────────────────────────────────────────

function createPointBasePositions(count: number, offsetX: number = 0): Float32Array {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const col = i % POINT_COLS;
    const row = Math.floor(i / POINT_COLS);
    pos[i * 3] = offsetX + (col / (POINT_COLS - 1) - 0.5) * (ROOM.w - 1.6);
    pos[i * 3 + 1] = 0.2 + (row / (POINT_ROWS - 1)) * (ROOM.h - 0.8);
    pos[i * 3 + 2] = (Math.sin(i * 0.73) * 0.4 - 0.2) * (ROOM.d - 1.2);
  }
  return pos;
}

function amplitudeToColor(value: number, min: number, max: number, target: THREE.Color) {
  const range = max - min || 1;
  const t = clamp((value - min) / range, 0, 1);
  target.setHSL((1 - t) * 0.33, 0.9, 0.35 + t * 0.35);
}

// ── Human transform calculator ─────────────────────────────────────

interface HumanTransform {
  posX: number; posY: number; posZ: number;
  rotX: number; bobY: number; leanForward: number;
}

function getHumanTransform(progress01: number, activityType: string, offsetX: number = 0): HumanTransform {
  const t = clamp(progress01, 0, 1);
  const bounds = PHASE_BOUNDS[activityType] ?? PHASE_BOUNDS.fall;

  if (activityType === 'fall') {
    const normalEnd = bounds[1], walkEnd = bounds[2], fallEnd = bounds[3];
    const inWalk = smoothstep(normalEnd, walkEnd, t);
    const inFall = smoothstep(walkEnd, fallEnd, t);
    const inAlert = smoothstep(fallEnd, 1.0, t);
    const walkProgress = clamp((t - normalEnd) / (walkEnd - normalEnd), 0, 1);
    const fallProgress = clamp((t - walkEnd) / (fallEnd - walkEnd), 0, 1);
    const walkStartX = offsetX - 2, walkEndX = offsetX + 1.5;
    const posX = lerp(walkStartX, walkEndX, walkProgress) * (1 - inAlert) * Math.max(inWalk, inFall) + (walkEndX) * inAlert + walkStartX * (1 - Math.max(inWalk, inFall)) * (1 - inAlert);
    // Simplified: use phase-based approach
    let px: number;
    if (t < normalEnd) px = offsetX;
    else if (t < walkEnd) px = lerp(offsetX - 2, offsetX + 1.5, walkProgress);
    else px = offsetX + 1.5;
    const posY = lerp(0.9, 0.15, fallProgress);
    const posZ = lerp(0, 0.5, walkProgress) * inWalk * (1 - inFall);
    const rotX = lerp(0, Math.PI / 2, fallProgress);
    const bobY = Math.sin(walkProgress * Math.PI * 4) * 0.06 * inWalk * (1 - inFall);
    const leanForward = 0.08 * inWalk * (1 - inFall);
    return { posX: px, posY, posZ, rotX, bobY, leanForward };
  }

  if (activityType === 'walk' || activityType === 'run') {
    const nEnd = bounds[1], wEnd = bounds[2];
    const inWalk = smoothstep(nEnd, wEnd, t);
    const wp = clamp((t - nEnd) / (wEnd - nEnd), 0, 1);
    return {
      posX: lerp(offsetX - 2, offsetX + 2, wp),
      posY: 0.9, posZ: lerp(0, 0.3, wp) * inWalk,
      rotX: 0, bobY: Math.sin(wp * Math.PI * 6) * 0.05 * inWalk,
      leanForward: 0.05 * inWalk,
    };
  }
  return { posX: offsetX, posY: 0.9, posZ: 0, rotX: 0, bobY: 0, leanForward: 0 };
}

function getPhase(progress01: number, activityType: string): NarrativePhase {
  const bounds = PHASE_BOUNDS[activityType] ?? PHASE_BOUNDS.fall;
  if (activityType === 'fall') {
    if (progress01 < bounds[1]) return 'normal';
    if (progress01 < bounds[2]) return 'walking';
    if (progress01 < bounds[3]) return 'falling';
    return 'alert';
  }
  if (progress01 < bounds[1]) return 'normal';
  if (progress01 < bounds[2]) return 'walking';
  return 'normal';
}

// ── useSequenceAnimator hook ───────────────────────────────────────

interface AnimState {
  phase: NarrativePhase;
  interpEnergy: number;
  interpVariance: number;
  interpMeanAmp: number;
  ampsA: number[]; ampsB: number[]; lerpFactor: number;
  humanTransform: HumanTransform;
  frameProgress: number;
  confidence: number; // derived confidence 0..1
}

function useSequenceAnimator(
  frames: FrameData[],
  activityType: string,
  playback: PlaybackState,
  offsetX: number,
  onPhaseChange: ((phase: NarrativePhase) => void) | null,
  onFrameChange: ((frame: number) => void) | null,
): { animState: AnimState; impactTrigger: number } {
  const frameProgress = useRef(playback.currentFrame);
  const lastClockTime = useRef(0);
  const lastReportedFrame = useRef(-1);
  const lastFrameCallTime = useRef(0);
  const [impactTrigger, setImpactTrigger] = useState(0);
  const prevPhase = useRef<NarrativePhase>('normal');
  const calmEnergy = useRef<number | null>(null);

  const totalFrames = frames.length;

  useEffect(() => {
    if (!playback.playing) frameProgress.current = playback.currentFrame;
  }, [playback.currentFrame, playback.playing]);

  useEffect(() => {
    if (frames.length > 0 && calmEnergy.current === null) {
      const slice = frames.slice(0, Math.max(1, Math.floor(frames.length * 0.2)));
      calmEnergy.current = slice.reduce((s, f) => s + (f.energy ?? 0), 0) / slice.length;
    }
  }, [frames]);

  useFrame(({ clock }) => {
    if (totalFrames === 0) return;
    if (playback.playing) {
      const delta = clock.elapsedTime - lastClockTime.current;
      lastClockTime.current = clock.elapsedTime;
      const frameDuration = BASE_FRAME_DURATION / playback.speed;
      frameProgress.current += delta / frameDuration;
      if (frameProgress.current >= totalFrames - 1) {
        if (playback.loop) frameProgress.current %= (totalFrames - 1);
        else frameProgress.current = totalFrames - 1;
      }
      if (frameProgress.current < 0) frameProgress.current = playback.loop ? totalFrames - 1 : 0;

      // Report frame changes to parent
      const intFrame = Math.floor(frameProgress.current);
      if (intFrame !== lastReportedFrame.current) {
        lastReportedFrame.current = intFrame;
        if (onFrameChange) {
          const toReport = intFrame;
          const now = Date.now();
          // Throttle reports to avoid flooding React with setState every animation frame
          if (now - lastFrameCallTime.current > 40) {
            lastFrameCallTime.current = now;
            requestAnimationFrame(() => onFrameChange(toReport));
          }
        }
      }
    } else {
      lastClockTime.current = clock.elapsedTime;
    }
  });

  const fp = totalFrames > 1 ? clamp(frameProgress.current, 0, totalFrames - 1) : 0;
  const progress = totalFrames > 1 ? fp / (totalFrames - 1) : 0;
  const frameA = Math.min(Math.floor(fp), totalFrames - 1);
  const frameB = Math.min(frameA + 1, totalFrames - 1);
  const lf = fp - frameA;
  const phase = getPhase(progress, activityType);

  useEffect(() => {
    if (phase === 'falling' && prevPhase.current !== 'falling') {
      setImpactTrigger((v) => v + 1);
    }
    prevPhase.current = phase;
  }, [phase]);

  // Report phase changes without feeding render-time updates back into React.
  useEffect(() => {
    if (phase !== playback.phase) onPhaseChange?.(phase);
  }, [phase, playback.phase, onPhaseChange]);

  const ampsA = frames[frameA]?.amplitude ?? [];
  const ampsB = frames[frameB]?.amplitude ?? [];
  const eA = frames[frameA]?.energy ?? 0;
  const eB = frames[frameB]?.energy ?? 0;
  const vA = frames[frameA]?.variance ?? 0;
  const vB = frames[frameB]?.variance ?? 0;
  const meanA = ampsA.length > 0 ? ampsA.reduce((s, v) => s + v, 0) / ampsA.length : 0;
  const meanB = ampsB.length > 0 ? ampsB.reduce((s, v) => s + v, 0) / ampsB.length : 0;

  // Confidence: how far current energy is from calm baseline
  const curEnergy = lerp(eA, eB, lf);
  const calm = calmEnergy.current ?? 1;
  const confidence = clamp((curEnergy - calm) / (calm * 2 || 1), 0, 1);

  return {
    animState: {
      phase,
      interpEnergy: lerp(eA, eB, lf),
      interpVariance: lerp(vA, vB, lf),
      interpMeanAmp: lerp(meanA, meanB, lf),
      ampsA, ampsB, lerpFactor: lf,
      humanTransform: getHumanTransform(progress, activityType, offsetX),
      frameProgress: fp,
      confidence,
    },
    impactTrigger,
  };
}

// ── Sub-components ─────────────────────────────────────────────────

function WoodFloor() {
  const tex = useMemo(() => createWoodTexture(), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[ROOM.w, ROOM.d]} />
      <meshStandardMaterial map={tex} color="#d4b896" roughness={0.7} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Room({ alertLevel }: { alertLevel: number }) {
  const wallOpacity = 0.2 + alertLevel * 0.3;
  const wallColor = new THREE.Color().lerpColors(
    new THREE.Color('#16213e'), new THREE.Color('#3a1010'), alertLevel,
  );

  return (
    <group>
      <WoodFloor />
      <Grid position={[0, 0.005, 0]} args={[ROOM.w, ROOM.d]} cellSize={0.5} cellThickness={0.2}
        cellColor="#444433" sectionSize={2} sectionThickness={0.6} sectionColor="#555544" fadeDistance={20} />
      <Wall pos={[0, ROOM.h / 2, -ROOM.d / 2]} size={[ROOM.w, ROOM.h, 0.05]} color={wallColor} opacity={wallOpacity} />
      <Wall pos={[0, ROOM.h / 2, ROOM.d / 2]} size={[ROOM.w, ROOM.h, 0.05]} color={wallColor} opacity={wallOpacity} />
      <Wall pos={[-ROOM.w / 2, ROOM.h / 2, 0]} size={[0.05, ROOM.h, ROOM.d]} color={wallColor} opacity={wallOpacity} />
      <Wall pos={[ROOM.w / 2, ROOM.h / 2, 0]} size={[0.05, ROOM.h, ROOM.d]} color={wallColor} opacity={wallOpacity} />

      {/* Wallpaper vertical lines on back wall */}
      {Array.from({ length: 16 }, (_, i) => (
        <mesh key={`wl-${i}`} position={[-ROOM.w / 2 + 0.3 + i * 0.5, ROOM.h / 2, -ROOM.d / 2 + 0.001]}>
          <boxGeometry args={[0.02, ROOM.h - 0.1, 0.005]} />
          <meshBasicMaterial color={alertLevel > 0.5 ? '#661111' : '#1a1a3a'} transparent opacity={0.15 + alertLevel * 0.25} />
        </mesh>
      ))}
    </group>
  );
}

function Wall({ pos, size, color, opacity }: {
  pos: [number, number, number]; size: [number, number, number];
  color: THREE.Color; opacity: number;
}) {
  return (
    <mesh position={pos}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── Furniture ──────────────────────────────────────────────────────

function Furniture({ offsetX }: { offsetX: number }) {
  const fx = offsetX + ROOM.w / 2 - 1.2;
  const fz = ROOM.d / 2 - 0.8;

  return (
    <group>
      {/* Table */}
      <mesh position={[fx, 0.45, fz]} castShadow>
        <boxGeometry args={[1.4, 0.06, 0.8]} />
        <meshStandardMaterial color="#3d3025" roughness={0.6} />
      </mesh>
      {/* Table legs */}
      {[[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]].map(([dx, dz], i) => (
        <mesh key={`tl-${i}`} position={[fx + dx, 0.22, fz + dz]}>
          <cylinderGeometry args={[0.04, 0.04, 0.44, 8]} />
          <meshStandardMaterial color="#2a1f15" roughness={0.7} />
        </mesh>
      ))}

      {/* Chair 1 (left of table) */}
      <Chair px={fx - 0.8} pz={fz} rot={0} />
      {/* Chair 2 (right of table) */}
      <Chair px={fx + 0.8} pz={fz + 0.1} rot={0.3} />
    </group>
  );
}

function Chair({ px, pz, rot }: { px: number; pz: number; rot: number }) {
  return (
    <group position={[px, 0, pz]} rotation={[0, rot, 0]}>
      {/* Seat */}
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.4, 0.05, 0.4]} />
        <meshStandardMaterial color="#4a3728" roughness={0.5} />
      </mesh>
      {/* Backrest */}
      <mesh position={[0, 0.7, -0.16]}>
        <boxGeometry args={[0.36, 0.35, 0.04]} />
        <meshStandardMaterial color="#4a3728" roughness={0.5} />
      </mesh>
      {/* Legs */}
      {[[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]].map(([dx, dz], i) => (
        <mesh key={`cl-${i}`} position={[dx, 0.2, dz]}>
          <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
          <meshStandardMaterial color="#2a1f15" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function Divider() {
  return (
    <group>
      <mesh position={[0, ROOM.h / 2, 0]}>
        <boxGeometry args={[0.03, ROOM.h, ROOM.d - 0.1]} />
        <meshStandardMaterial color="#334466" transparent opacity={0.5} />
      </mesh>
      {/* Label backgrounds */}
      <mesh position={[-2, ROOM.h - 0.2, ROOM.d / 2 - 0.02]} rotation={[0, 0, 0]}>
        <planeGeometry args={[3, 0.35]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[2, ROOM.h - 0.2, ROOM.d / 2 - 0.02]} rotation={[0, 0, 0]}>
        <planeGeometry args={[3, 0.35]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ── WiFi AP ────────────────────────────────────────────────────────

function WiFiAP({ intensity, alertLevel }: { intensity: number; alertLevel: number }) {
  const glowRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (glowRef.current) glowRef.current.scale.setScalar(1 + Math.sin(t * 3) * 0.08 + intensity * 0.3);
    if (pulseRef.current) {
      const mat = pulseRef.current.material as THREE.MeshBasicMaterial;
      const phase = (t * 1.5) % 3;
      mat.opacity = Math.max(0, (1 - phase / 3)) * 0.6 * (intensity + alertLevel * 0.5);
      pulseRef.current.scale.setScalar(0.3 + phase * 3 * (0.5 + intensity * 1.5 + alertLevel));
    }
  });
  return (
    <group position={AP_POS}>
      <mesh>
        <boxGeometry args={[0.4, 0.3, 0.1]} />
        <meshStandardMaterial color="#00aaff" emissive={alertLevel > 0.5 ? '#440000' : '#004488'} emissiveIntensity={0.8 + intensity * 1.2} />
      </mesh>
      <mesh position={[-0.12, 0.25, 0]}><cylinderGeometry args={[0.02, 0.02, 0.3, 8]} /><meshStandardMaterial color="#888888" /></mesh>
      <mesh position={[0.12, 0.25, 0]}><cylinderGeometry args={[0.02, 0.02, 0.3, 8]} /><meshStandardMaterial color="#888888" /></mesh>
      <mesh ref={glowRef}><sphereGeometry args={[0.25, 16, 16]} /><meshStandardMaterial color="#00aaff" emissive="#0088ff" emissiveIntensity={1.2 + intensity * 0.8} transparent opacity={0.4} /></mesh>
      <mesh ref={pulseRef}><sphereGeometry args={[0.25, 24, 24]} /><meshBasicMaterial color={alertLevel > 0.5 ? '#ff4444' : '#00aaff'} transparent opacity={0.3} /></mesh>
    </group>
  );
}

// ── Human Agent + Confidence Ring ──────────────────────────────────

function HumanAgent({ transform, phase, confidence }: {
  transform: HumanTransform; phase: NarrativePhase; confidence: number;
}) {
  const alertGlowRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (alertGlowRef.current) {
      const v = phase === 'alert' ? 1 : 0;
      const p = 0.5 + Math.sin(clock.elapsedTime * 8) * 0.5;
      alertGlowRef.current.scale.setScalar(1.3 + p * 0.4);
      (alertGlowRef.current.material as THREE.MeshBasicMaterial).opacity = v * (0.3 + p * 0.3);
    }
    if (ringRef.current) {
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      const hue = confidence > 0.8 ? 0 : confidence > 0.4 ? 0.1 : 0.33;
      mat.color.setHSL(hue, 1, 0.5);
      mat.opacity = 0.5 + confidence * 0.5;
      ringRef.current.scale.setScalar(1 + confidence * 0.3);
      // Rotate the ring
      ringRef.current.rotation.z += 0.02;
      ringRef.current.rotation.x += 0.01;
    }
  });

  const { posX, posY, posZ, rotX, bobY, leanForward } = transform;
  const alertColor = phase === 'alert' ? '#ff2222' : '#e94560';

  return (
    <group position={[posX, posY + bobY, posZ]} rotation={[rotX, 0, leanForward]}>
      {/* Alert ground ring */}
      <mesh ref={alertGlowRef} position={[0, -posY + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.55, 32]} />
        <meshBasicMaterial color="#ff2222" side={THREE.DoubleSide} transparent opacity={0} />
      </mesh>

      {/* Confidence ring above head */}
      <mesh ref={ringRef} position={[0, 1.4, 0]}>
        <torusGeometry args={[0.22, 0.04, 16, 32]} />
        <meshBasicMaterial color="#44cc44" transparent opacity={0.6} />
      </mesh>

      {/* Body */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <capsuleGeometry args={[0.18, 0.75, 8, 16]} />
        <meshStandardMaterial color={alertColor} roughness={0.5} emissive={phase === 'alert' ? '#ff0000' : '#000000'} emissiveIntensity={phase === 'alert' ? 0.5 : 0} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.05, 0]}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial color="#ffccaa" roughness={0.7} />
      </mesh>
      {/* Legs */}
      <mesh position={[-0.07, -0.12, 0]} rotation={[bobY * 3, 0, 0]}>
        <capsuleGeometry args={[0.07, 0.35, 4, 8]} />
        <meshStandardMaterial color="#3344aa" roughness={0.6} />
      </mesh>
      <mesh position={[0.07, -0.12, 0]} rotation={[-bobY * 3, 0, 0]}>
        <capsuleGeometry args={[0.07, 0.35, 4, 8]} />
        <meshStandardMaterial color="#3344aa" roughness={0.6} />
      </mesh>
    </group>
  );
}

// ── RF Point Cloud ─────────────────────────────────────────────────

function RFPointCloud({ ampA, ampB, lerpFactor, ampMin, ampMax, ampMean, count, offsetX }: {
  ampA: number[]; ampB: number[]; lerpFactor: number;
  ampMin: number; ampMax: number; ampMean: number; count: number; offsetX: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const basePos = useMemo(() => createPointBasePositions(count, offsetX), [count, offsetX]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    if (!meshRef.current) return;
    const n = Math.min(count, ampA.length, ampB.length);
    const halfRange = (ampMax - ampMin) / 2;
    for (let i = 0; i < n; i++) {
      const val = lerp(ampA[i], ampB[i], lerpFactor);
      const dev = Math.abs(val - ampMean);
      const size = 0.03 + (dev / (halfRange || 1)) * 0.1;
      const yOff = ((val - ampMin) / ((ampMax - ampMin) || 1) - 0.5) * 0.8;
      dummy.position.set(basePos[i * 3], basePos[i * 3 + 1] + yOff, basePos[i * 3 + 2]);
      dummy.scale.setScalar(clamp(size, 0.02, 0.4));
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      amplitudeToColor(val, ampMin, ampMax, color);
      meshRef.current.setColorAt(i, color);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.instanceColor!.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 5, 5]} />
      <meshStandardMaterial roughness={0.35} />
    </instancedMesh>
  );
}

// ── Energy Ripples ─────────────────────────────────────────────────

function EnergyRipples({ energy, maxEnergy, phase, humanPos }: {
  energy: number; maxEnergy: number; phase: NarrativePhase; humanPos: [number, number, number];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const ringCount = 4;
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    const intensity = clamp(energy / (maxEnergy || 1), 0.1, 1);
    const speed = 0.6 + intensity * 2.5;
    const hue = phase === 'alert' ? 0 : phase === 'falling' ? 0.03 : 0.33;
    groupRef.current.children.forEach((child, i) => {
      const ring = child as THREE.Mesh;
      const cycle = (t * speed + i * 0.625) % 2.5;
      ring.scale.setScalar(0.3 + cycle * 2.8 * intensity);
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, (1 - cycle / 2.5)) * 0.5 * intensity;
      mat.color.setHSL(hue, 1, 0.4 + intensity * 0.2);
    });
  });
  return (
    <group ref={groupRef} position={humanPos}>
      {Array.from({ length: ringCount }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.3, 0.38, 64]} />
          <meshBasicMaterial color="#ff6644" side={THREE.DoubleSide} transparent opacity={0.3} />
        </mesh>
      ))}
    </group>
  );
}

// ── Impact Particles ───────────────────────────────────────────────

interface Particle { pos: THREE.Vector3; vel: THREE.Vector3; life: number; maxLife: number; size: number; }

function ImpactParticles({ trigger, pos }: { trigger: number; pos: [number, number, number] }) {
  const pointsRef = useRef<THREE.Points>(null);
  const particles = useRef<Particle[]>([]);
  const prevTrigger = useRef(trigger);

  useEffect(() => {
    if (trigger !== prevTrigger.current && trigger > 0) {
      prevTrigger.current = trigger;
      // Spawn particles
      const p: Particle[] = [];
      for (let i = 0; i < 60; i++) {
        const angle = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.5;
        const speed = 1.5 + Math.random() * 4;
        p.push({
          pos: new THREE.Vector3(pos[0], pos[1] + 0.1, pos[2]),
          vel: new THREE.Vector3(
            Math.cos(angle) * Math.cos(phi) * speed,
            Math.sin(phi) * speed * 1.5,
            Math.sin(angle) * Math.cos(phi) * speed,
          ),
          life: 1.5, maxLife: 1.5, size: 0.02 + Math.random() * 0.06,
        });
      }
      particles.current = p;
    }
  }, [trigger]);

  useFrame((_, delta) => {
    if (!pointsRef.current || particles.current.length === 0) return;
    const geo = pointsRef.current.geometry;
    const positions = geo.attributes.position.array as Float32Array;
    const colors = geo.attributes.color.array as Float32Array;
    const sizes = geo.attributes.size.array as Float32Array;

    let aliveCount = 0;
    for (const p of particles.current) {
      p.life -= delta;
      if (p.life <= 0) continue;
      p.pos.add(p.vel.clone().multiplyScalar(delta));
      p.vel.y -= 3 * delta; // gravity
      const idx = aliveCount * 3;
      positions[idx] = p.pos.x;
      positions[idx + 1] = p.pos.y;
      positions[idx + 2] = p.pos.z;
      // Color: orange → red fade
      const t = 1 - p.life / p.maxLife;
      colors[idx] = 1;
      colors[idx + 1] = 0.4 * (1 - t);
      colors[idx + 2] = 0.05 * (1 - t);
      sizes[aliveCount] = p.size * (1 - t * 0.7);
      aliveCount++;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.setDrawRange(0, aliveCount);
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array(60 * 3), 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[new Float32Array(60 * 3), 3]}
        />
        <bufferAttribute
          attach="attributes-size"
          args={[new Float32Array(60), 1]}
        />
      </bufferGeometry>
      <pointsMaterial size={0.06} vertexColors transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

// ── Ambient + Phase Lighting ───────────────────────────────────────

function AmbientLighting({ phase, energy, maxEnergy }: { phase: NarrativePhase; energy: number; maxEnergy: number }) {
  const ambRef = useRef<THREE.AmbientLight>(null);
  const intensity = clamp(energy / (maxEnergy || 1), 0, 1);
  useFrame(() => {
    if (!ambRef.current) return;
    const base = 0.25;
    const alertB = phase === 'alert' ? 0.15 + Math.sin(Date.now() * 0.005) * 0.05 : 0;
    const warmB = intensity * 0.15;
    ambRef.current.intensity = base + alertB + warmB;
    ambRef.current.color.setHSL(phase === 'alert' ? 0.02 : phase === 'falling' ? 0.06 : 0.6, phase === 'alert' ? 0.5 : 0.1, 0.5);
  });
  return <ambientLight ref={ambRef} intensity={0.25} />;
}

// ── Overlays ───────────────────────────────────────────────────────

function PhaseLabel({ phase, offsetX }: { phase: NarrativePhase; offsetX: number }) {
  const color = phase === 'alert' ? '#ff3333' : phase === 'falling' ? '#ff8800' : phase === 'walking' ? '#ffcc00' : '#44cc44';
  const text = phase === 'normal' ? 'NORMAL' : phase === 'walking' ? 'WALKING' : phase === 'falling' ? 'FALLING!' : '⚠ ALERT ⚠';
  return (
    <Text position={[offsetX, ROOM.h - 0.3, ROOM.d / 2 - 0.1]} fontSize={0.18} color={color} anchorX="center" anchorY="middle" fontWeight="bold">
      {text}
    </Text>
  );
}

function AlertOverlay({ visible, humanPos }: { visible: boolean; humanPos: [number, number, number] }) {
  if (!visible) return null;
  return (
    <Html position={[humanPos[0], humanPos[1] + 1.2, humanPos[2]]} center sprite>
      <div style={{ background: 'rgba(220,38,38,0.92)', color: '#fff', padding: '8px 16px', borderRadius: 2, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', animation: 'pulse-alert 0.8s ease-in-out infinite', boxShadow: '0 0 20px rgba(255,0,0,0.6)' }}>
        ⚠ 摔倒检测触发！已发送告警
      </div>
    </Html>
  );
}

function MetricsOverlay({ energy, variance, meanAmp, confidence, phase, offsetX }: {
  energy: number; variance: number; meanAmp: number; confidence: number; phase: NarrativePhase; offsetX: number;
}) {
  const barColor = confidence > 0.7 ? '#ef4444' : confidence > 0.3 ? '#f59e0b' : '#22c55e';
  const barWidth = clamp(confidence * 100, 0, 100);
  return (
    <Html position={[offsetX - ROOM.w / 2 + 1.2, ROOM.h - 0.6, ROOM.d / 2 - 0.01]} style={{ width: 220 }}>
      <div style={{ background: 'rgba(0,0,0,0.65)', color: '#e2e8f0', borderRadius: 2, padding: '8px 12px', fontSize: 10, fontFamily: 'monospace', lineHeight: 1.6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>实时指标 {phase.toUpperCase()}</div>
        <div>能量: <strong>{energy.toFixed(1)}</strong></div>
        <div>方差: <strong>{variance.toFixed(2)}</strong></div>
        <div>平均幅度: <strong>{meanAmp.toFixed(2)}</strong></div>
        <div style={{ marginTop: 4 }}>
          置信度:
          <div style={{ background: '#334', borderRadius: 4, height: 8, marginTop: 2, overflow: 'hidden' }}>
            <div style={{ width: `${barWidth}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.15s' }} />
          </div>
          <span style={{ color: barColor, fontSize: 9 }}>{(confidence * 100).toFixed(0)}%</span>
        </div>
      </div>
    </Html>
  );
}

// ── Dynamic Camera Controller ──────────────────────────────────────

function DynamicCamera({ phase, humanPos, enabled }: {
  phase: NarrativePhase; humanPos: [number, number, number]; enabled: boolean;
}) {
  const { camera } = useThree();
  const shakeIntensity = useRef(0);
  const targetZoom = useRef(8);
  const targetLookAt = useRef(new THREE.Vector3(humanPos[0], 1, humanPos[2]));

  useEffect(() => {
    if (!enabled) return;
    if (phase === 'falling') {
      shakeIntensity.current = 0.25;
      targetZoom.current = 6;
    } else if (phase === 'alert') {
      shakeIntensity.current = 0.08;
      targetZoom.current = 5;
    } else {
      shakeIntensity.current = 0;
      targetZoom.current = 8;
    }
    targetLookAt.current.set(humanPos[0], phase === 'alert' ? 0.3 : 1, humanPos[2]);
  }, [phase, humanPos[0], humanPos[1], humanPos[2], enabled]);

  useFrame(() => {
    if (!enabled) return;
    // Smooth shake decay
    shakeIntensity.current = lerp(shakeIntensity.current, 0, 0.05);
    const shakeX = (Math.random() - 0.5) * shakeIntensity.current;
    const shakeY = (Math.random() - 0.5) * shakeIntensity.current;

    // Smooth zoom
    const dist = Math.sqrt(
      (camera.position.x - humanPos[0]) ** 2 +
      (camera.position.z - humanPos[2]) ** 2,
    );
    const targetDist = targetZoom.current;
    if (Math.abs(dist - targetDist) > 0.05) {
      const factor = targetDist / (dist || 1);
      camera.position.x += (humanPos[0] + (camera.position.x - humanPos[0]) * factor - camera.position.x) * 0.03;
      camera.position.z += (humanPos[2] + (camera.position.z - humanPos[2]) * factor - camera.position.z) * 0.03;
    }

    camera.position.x += shakeX;
    camera.position.y += shakeY;
  });

  return null;
}

// ── Audio manager ──────────────────────────────────────────────────

function useNarrativeAudio(phase: NarrativePhase, prevPhase: NarrativePhase) {
  useEffect(() => {
    if (phase === prevPhase) return;
    let src = '';
    if (phase === 'walking') src = '/sounds/footsteps.mp3';
    else if (phase === 'falling') src = '/sounds/impact.mp3';
    else if (phase === 'alert') src = '/sounds/alert.mp3';
    if (src) {
      try {
        const audio = new Audio(src);
        audio.volume = phase === 'walking' ? 0.3 : 0.7;
        audio.play().catch(() => { /* browser may block autoplay */ });
      } catch { /* ignore */ }
    }
  }, [phase]);
}

// ── Single-side group (human + pointcloud + ripples + labels) ──────

interface SideGroupProps {
  sequence: SequenceData | null;
  animState: AnimState;
  impactTrigger: number;
  offsetX: number;
  sideLabel: string;
  isComparison: boolean;
  maxEnergy: number;
}

function SideGroup({ sequence, animState, impactTrigger, offsetX, sideLabel, isComparison, maxEnergy }: SideGroupProps) {
  const meta = sequence?.metadata;
  const ampMin = meta?.amplitude_min ?? 0;
  const ampMax = meta?.amplitude_max ?? 1;
  const ampMean = meta?.amplitude_mean ?? 0.5;
  const pointCount = isComparison ? 45 : (meta?.subcarrier_count ?? SUBCARRIER_COUNT);
  const hp: [number, number, number] = [animState.humanTransform.posX, 0.02, animState.humanTransform.posZ];

  return (
    <group>
      <HumanAgent transform={animState.humanTransform} phase={animState.phase} confidence={animState.confidence} />
      <RFPointCloud ampA={animState.ampsA} ampB={animState.ampsB} lerpFactor={animState.lerpFactor}
        ampMin={ampMin} ampMax={ampMax} ampMean={ampMean} count={pointCount} offsetX={offsetX} />
      <EnergyRipples energy={animState.interpEnergy} maxEnergy={maxEnergy} phase={animState.phase} humanPos={hp} />
      <PhaseLabel phase={animState.phase} offsetX={offsetX} />
      <AlertOverlay visible={animState.phase === 'alert'} humanPos={[animState.humanTransform.posX, animState.humanTransform.posY, animState.humanTransform.posZ]} />
      <MetricsOverlay energy={animState.interpEnergy} variance={animState.interpVariance}
        meanAmp={animState.interpMeanAmp} confidence={animState.confidence} phase={animState.phase} offsetX={offsetX} />
      <ImpactParticles trigger={impactTrigger} pos={hp} />
      {/* Side label in comparison mode */}
      {isComparison && (
        <Text position={[offsetX, ROOM.h - 0.2, ROOM.d / 2 - 0.02]} fontSize={0.2} color="#ffffff" anchorX="center" anchorY="middle" fontWeight="bold">
          {sideLabel}
        </Text>
      )}
    </group>
  );
}

// ── Single Scene Content ───────────────────────────────────────────

interface SceneContentSingleProps {
  sequence: SequenceData | null;
  playback: PlaybackState;
  onPhaseChange: (phase: NarrativePhase) => void;
  onFrameChange: (frame: number) => void;
}

function SceneContentSingle({ sequence, playback, onPhaseChange, onFrameChange }: SceneContentSingleProps) {
  const frames = sequence?.frames ?? [];
  const activityType = sequence?.metadata?.activity_type ?? 'normal';
  const maxEnergy = useMemo(() => {
    let m = 1; for (const f of frames) { if (f.energy && f.energy > m) m = f.energy; } return m;
  }, [frames]);

  const { animState, impactTrigger } = useSequenceAnimator(frames, activityType, playback, 0, onPhaseChange, onFrameChange);
  const alertLevel = animState.phase === 'alert' ? 1 : animState.phase === 'falling' ? 0.6 : 0;
  const prevPhaseRef = useRef<NarrativePhase>('normal');
  useNarrativeAudio(animState.phase, prevPhaseRef.current);
  prevPhaseRef.current = animState.phase;

  return (
    <>
      <AmbientLighting phase={animState.phase} energy={animState.interpEnergy} maxEnergy={maxEnergy} />
      <pointLight position={AP_POS} intensity={1.5 + (alertLevel > 0.5 ? 1 : 0)}
        color={alertLevel > 0.5 ? '#ffaaaa' : '#aaccff'} distance={12} />
      <directionalLight position={[5, 8, 5]} intensity={0.4} />
      <Room alertLevel={alertLevel} />
      <Furniture offsetX={0} />
      <WiFiAP intensity={clamp(animState.interpEnergy / (maxEnergy || 1), 0, 1)} alertLevel={alertLevel} />
      <SideGroup sequence={sequence} animState={animState} impactTrigger={impactTrigger}
        offsetX={0} sideLabel="" isComparison={false} maxEnergy={maxEnergy} />
      <Text position={[ROOM.w / 2 - 1, ROOM.h - 0.3, ROOM.d / 2 - 0.1]} fontSize={0.11} color="#888888" anchorX="right">
        {`${(animState.frameProgress + 1).toFixed(1)} / ${frames.length}`}
      </Text>
      <DynamicCamera phase={animState.phase} humanPos={[animState.humanTransform.posX, animState.humanTransform.posY, animState.humanTransform.posZ]} enabled />
      <OrbitControls target={[animState.humanTransform.posX, 1, animState.humanTransform.posZ]}
        minDistance={3} maxDistance={15} maxPolarAngle={Math.PI * 0.7} enableDamping dampingFactor={0.1} />
    </>
  );
}

// ── Comparison (Dual) Scene Content ────────────────────────────────

interface SceneContentDualProps {
  sequenceLeft: SequenceData | null;
  sequenceRight: SequenceData | null;
  playback: PlaybackState;
  onPhaseChange: (phase: NarrativePhase) => void;
}

function SceneContentDual({ sequenceLeft, sequenceRight, playback, onPhaseChange }: SceneContentDualProps) {
  const framesL = sequenceLeft?.frames ?? [];
  const framesR = sequenceRight?.frames ?? [];
  const typeL = sequenceLeft?.metadata?.activity_type ?? 'fall';
  const typeR = sequenceRight?.metadata?.activity_type ?? 'walk';

  const maxEnergy = useMemo(() => {
    let m = 1;
    for (const f of [...framesL, ...framesR]) { if (f.energy && f.energy > m) m = f.energy; }
    return m;
  }, [framesL, framesR]);

  const { animState: animL, impactTrigger: impactL } = useSequenceAnimator(framesL, typeL, playback, -ROOM.w / 4, null, null);
  const { animState: animR, impactTrigger: impactR } = useSequenceAnimator(framesR, typeR, playback, ROOM.w / 4, null, null);
  const alertLevel = Math.max(
    animL.phase === 'alert' ? 1 : animL.phase === 'falling' ? 0.6 : 0,
    animR.phase === 'alert' ? 1 : animR.phase === 'falling' ? 0.6 : 0,
  );

  // Unified phase = most severe of the two
  const unifiedPhase: NarrativePhase =
    animL.phase === 'alert' || animR.phase === 'alert' ? 'alert' :
    animL.phase === 'falling' || animR.phase === 'falling' ? 'falling' :
    animL.phase === 'walking' || animR.phase === 'walking' ? 'walking' : 'normal';
  useEffect(() => { onPhaseChange(unifiedPhase); }, [unifiedPhase]);

  return (
    <>
      <AmbientLighting phase={unifiedPhase} energy={Math.max(animL.interpEnergy, animR.interpEnergy)} maxEnergy={maxEnergy} />
      <pointLight position={AP_POS} intensity={1.5 + (alertLevel > 0.5 ? 1 : 0)}
        color={alertLevel > 0.5 ? '#ffaaaa' : '#aaccff'} distance={12} />
      <directionalLight position={[5, 8, 5]} intensity={0.4} />
      <Room alertLevel={alertLevel} />
      <Furniture offsetX={-ROOM.w / 4} />
      <Furniture offsetX={ROOM.w / 4} />
      <Divider />
      <WiFiAP intensity={clamp(Math.max(animL.interpEnergy, animR.interpEnergy) / (maxEnergy || 1), 0, 1)} alertLevel={alertLevel} />
      <SideGroup sequence={sequenceLeft} animState={animL} impactTrigger={impactL}
        offsetX={-ROOM.w / 4} sideLabel={typeL.toUpperCase()} isComparison maxEnergy={maxEnergy} />
      <SideGroup sequence={sequenceRight} animState={animR} impactTrigger={impactR}
        offsetX={ROOM.w / 4} sideLabel={typeR.toUpperCase()} isComparison maxEnergy={maxEnergy} />
      <DynamicCamera phase={unifiedPhase} humanPos={[0, 1, 0]} enabled={false} />
      <OrbitControls target={[0, 1, 0]} minDistance={5} maxDistance={18} maxPolarAngle={Math.PI * 0.7} enableDamping dampingFactor={0.1} />
    </>
  );
}

// ── Exported wrapper ───────────────────────────────────────────────

export interface RF3DSceneProps {
  sequence: SequenceData | null;
  sequenceRight?: SequenceData | null; // for comparison mode
  playback: PlaybackState;
  onFrameChange?: (frame: number) => void;
  onPhaseChange: (phase: NarrativePhase) => void;
}

export default function RF3DScene({ sequence, sequenceRight, playback, onFrameChange, onPhaseChange }: RF3DSceneProps) {
  const isComparison = !!sequenceRight;
  return (
    <div style={{ width: '100%', height: '100%', minHeight: 500, background: '#0a0a1a', borderRadius: 2 }}>
      <style>{`
        @keyframes pulse-alert { 0%,100% { transform:scale(1); } 50% { transform:scale(1.08); } }
      `}</style>
      <Canvas camera={{ position: [8, 5, 8], fov: 50, near: 0.1, far: 50 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => { gl.setClearColor('#0a0a1a'); }}>
        {isComparison ? (
          <SceneContentDual
            sequenceLeft={sequence}
            sequenceRight={sequenceRight}
            playback={playback}
            onPhaseChange={onPhaseChange}
          />
        ) : (
          <SceneContentSingle
            sequence={sequence}
            playback={playback}
            onPhaseChange={onPhaseChange}
            onFrameChange={onFrameChange ?? (() => {})}
          />
        )}
      </Canvas>
    </div>
  );
}
