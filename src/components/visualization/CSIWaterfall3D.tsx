import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../../store';

const MAX_HISTORY = 100;
const SUBCARRIER_COUNT = 30;
const SURFACE_WIDTH = 7;
const SURFACE_DEPTH = 5;
const AMPLITUDE_SCALE = 2.0;

function amplitudeToColor(amplitude: number, minAmp: number, maxAmp: number, target: THREE.Color) {
  const range = maxAmp - minAmp || 1;
  const t = Math.max(0, Math.min(1, (amplitude - minAmp) / range));
  target.setHSL((1 - t) * 0.6, 0.9, 0.25 + t * 0.45);
}

function BaseGrid() {
  return (
    <group position={[0, -0.01, -SURFACE_DEPTH / 2]}>
      <gridHelper
        args={[SURFACE_WIDTH, SUBCARRIER_COUNT - 1, '#223344', '#1a2a3a']}
      />
      {/* Time-direction reference lines */}
      {Array.from({ length: 11 }, (_, i) => (
        <mesh key={`tline-${i}`} position={[0, 0.003, -i * (SURFACE_DEPTH / 10)]}>
          <boxGeometry args={[SURFACE_WIDTH, 0.003, 0.02]} />
          <meshBasicMaterial color="#223344" transparent opacity={0.25} />
        </mesh>
      ))}
    </group>
  );
}

function WaterfallSurface({ alertActive }: { alertActive: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);

  const historyRef = useRef<Float32Array[]>([]);
  const prevFrameId = useRef<number>(-1);
  const latestMessage = useAppStore((s) => s.latestMessage);
  const globalMinRef = useRef<number>(Infinity);
  const globalMaxRef = useRef<number>(-Infinity);

  useEffect(() => {
    const fid = latestMessage?.frame?.frame_id;
    if (fid === undefined || fid === prevFrameId.current) return;
    prevFrameId.current = fid;

    const sc = latestMessage?.frame?.subcarriers ?? [];
    if (sc.length === 0) return;

    const values: number[] =
      sc.length >= SUBCARRIER_COUNT
        ? sc.slice(0, SUBCARRIER_COUNT)
        : (() => {
            const padded = [...sc];
            while (padded.length < SUBCARRIER_COUNT)
              padded.push(padded[padded.length - 1] ?? 0);
            return padded;
          })();

    for (const v of values) {
      if (v < globalMinRef.current) globalMinRef.current = v;
      if (v > globalMaxRef.current) globalMaxRef.current = v;
    }

    historyRef.current.push(new Float32Array(values));
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    }
  }, [latestMessage]);

  const geo = useMemo(() => {
    const cols = SUBCARRIER_COUNT;
    const rows = MAX_HISTORY;
    const positions = new Float32Array(rows * cols * 3);
    const colors = new Float32Array(rows * cols * 3);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = (r * cols + c) * 3;
        positions[idx] = (c / (cols - 1) - 0.5) * SURFACE_WIDTH;
        positions[idx + 1] = 0;
        positions[idx + 2] = -(r / (rows - 1)) * SURFACE_DEPTH;
        colors[idx] = 0.1;
        colors[idx + 1] = 0.2;
        colors[idx + 2] = 0.5;
      }
    }

    const indices: number[] = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c;
        const b = a + 1;
        const d = (r + 1) * cols + c;
        const e = d + 1;
        indices.push(a, b, d, b, e, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, []);

  useFrame(() => {
    const history = historyRef.current;
    if (history.length === 0) return;

    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const colAttr = geo.attributes.color as THREE.BufferAttribute;
    const rows = MAX_HISTORY;
    const cols = SUBCARRIER_COUNT;
    const bufLen = history.length;

    const gMin = globalMinRef.current === Infinity ? 0 : globalMinRef.current;
    const gMax = globalMaxRef.current === -Infinity ? 1 : globalMaxRef.current;
    const tempColor = new THREE.Color();

    for (let r = 0; r < rows; r++) {
      const histIdx = r - (rows - bufLen);
      const ampRow = histIdx >= 0 && histIdx < bufLen ? history[histIdx] : null;

      for (let c = 0; c < cols; c++) {
        const amp = ampRow ? ampRow[c] : 0;
        const idx = r * cols + c;
        const i3 = idx * 3;

        posAttr.array[i3 + 1] = amp * AMPLITUDE_SCALE;

        amplitudeToColor(amp, gMin, gMax, tempColor);
        colAttr.array[i3] = tempColor.r;
        colAttr.array[i3 + 1] = tempColor.g;
        colAttr.array[i3 + 2] = tempColor.b;
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geo.computeVertexNormals();
    geo.index!.needsUpdate = true;
  });

  return (
    <mesh ref={meshRef} geometry={geo}>
      <meshStandardMaterial
        vertexColors
        roughness={0.35}
        metalness={0.05}
        side={THREE.DoubleSide}
        transparent
        opacity={0.88}
      />
    </mesh>
  );
}


function AlertPulse({ active }: { active: boolean }) {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const v = active ? 1 : 0;
    const p = 0.5 + Math.sin(clock.elapsedTime * 6) * 0.5;
    ringRef.current.scale.setScalar(1 + p * 0.15 * v);
    (ringRef.current.material as THREE.MeshBasicMaterial).opacity =
      v * (0.2 + p * 0.2);
  });

  return (
    <mesh
      ref={ringRef}
      position={[0, 0.02, -SURFACE_DEPTH * 0.3]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <ringGeometry args={[SURFACE_WIDTH * 0.35, SURFACE_WIDTH * 0.4, 64]} />
      <meshBasicMaterial
        color="#ff2222"
        side={THREE.DoubleSide}
        transparent
        opacity={0}
      />
    </mesh>
  );
}


function SceneLighting({ alertActive }: { alertActive: boolean }) {
  const ambRef = useRef<THREE.AmbientLight>(null);

  useFrame(() => {
    if (!ambRef.current) return;
    ambRef.current.intensity = 0.3 + (alertActive ? 0.15 : 0);
    ambRef.current.color.setHSL(alertActive ? 0.03 : 0.58, 0.2, 0.5);
  });

  return (
    <>
      <ambientLight ref={ambRef} intensity={0.3} />
      <directionalLight position={[4, 6, 2]} intensity={0.5} />
      <pointLight
        position={[0, AMPLITUDE_SCALE * 0.6, 0]}
        intensity={alertActive ? 1.2 : 0.4}
        color={alertActive ? '#ff4444' : '#4488cc'}
        distance={SURFACE_WIDTH * 1.5}
      />
    </>
  );
}


function AxisLabels({ minAmp, maxAmp }: { minAmp: number; maxAmp: number }) {
  return (
    <group>
      <Text
        position={[0, -0.25, 0.3]}
        fontSize={0.2}
        color="#667788"
        anchorX="center"
        anchorY="middle"
      >
        子载波 (30)
      </Text>
      <Text
        position={[-SURFACE_WIDTH / 2 - 0.5, AMPLITUDE_SCALE * 0.5, 0.3]}
        fontSize={0.16}
        color="#667788"
        anchorX="right"
        anchorY="middle"
      >
        {`${minAmp.toFixed(2)} ~ ${maxAmp.toFixed(2)}`}
      </Text>
      <Text
        position={[SURFACE_WIDTH / 2 - 0.2, AMPLITUDE_SCALE + 0.3, 0.3]}
        fontSize={0.2}
        color="#44cc44"
        anchorX="right"
        anchorY="middle"
        fontWeight="bold"
      >
        实时 CSI 瀑布图
      </Text>
    </group>
  );
}


function SceneContent() {
  const alertActive = useAppStore(
    (s) => s.latestMessage?.result?.alert ?? false,
  );

  return (
    <>
      <SceneLighting alertActive={alertActive} />
      <BaseGrid />
      <WaterfallSurface alertActive={alertActive} />
      <AlertPulse active={alertActive} />
      <AxisLabels minAmp={-0.5} maxAmp={0.5} />
      <OrbitControls
        target={[0, AMPLITUDE_SCALE * 0.25, -SURFACE_DEPTH * 0.5]}
        minDistance={3}
        maxDistance={14}
        maxPolarAngle={Math.PI * 0.55}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

export interface CSIWaterfall3DProps {
  height?: number;
}

export default function CSIWaterfall3D({ height = 500 }: CSIWaterfall3DProps) {
  const wsState = useAppStore((s) => s.wsState);

  return (
    <div
      style={{
        width: '100%',
        height,
        minHeight: 400,
        background: '#080818',
        borderRadius: 2,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Offline overlay */}
      {wsState !== 'online' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(8, 8, 24, 0.75)',
            color: '#8899aa',
            fontSize: 14,
            fontFamily: 'monospace',
            pointerEvents: 'none',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
            <div>等待 CSI 数据流...</div>
            <div style={{ fontSize: 11, marginTop: 4, color: '#556677' }}>
              {wsState === 'checking'
                ? '正在连接 WebSocket...'
                : 'WebSocket 已断开'}
            </div>
          </div>
        </div>
      )}

      <Canvas
        camera={{
          position: [6, 4.5, SURFACE_DEPTH * 0.7],
          fov: 50,
          near: 0.1,
          far: 50,
        }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => gl.setClearColor('#080818')}
      >
        <SceneContent />
      </Canvas>

      {/* Color legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          right: 12,
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontFamily: 'monospace',
          fontSize: 9,
          color: '#8899aa',
          background: 'rgba(0,0,0,0.5)',
          padding: '2px 6px',
          borderRadius: 2,
        }}
      >
        <span>低</span>
        <div
          style={{
            width: 80,
            height: 10,
            borderRadius: 2,
            background:
              'linear-gradient(90deg, #0033cc, #00aaff, #00cc66, #ffcc00, #ff3300)',
          }}
        />
        <span>高</span>
      </div>
    </div>
  );
}
