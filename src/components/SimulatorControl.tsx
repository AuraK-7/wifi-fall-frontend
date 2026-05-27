import { useMemo, useState } from 'react';
import {
  clearSimulatorSequence,
  getBackendStatus,
  getSimulatorSequence,
  resetDetector,
  sendSimulatorLabel,
  setSimulatorDevice,
  setSimulatorRoom,
  setSimulatorSequence,
} from '../api/client';
import type { BackendStatus, SimulatorLabel, SimulatorSequenceItem } from '../types/csi';

interface SimulatorControlProps {
  status: BackendStatus | null;
  onStatusRefresh?: (status: BackendStatus) => void;
}

const SIMULATOR_LABELS: SimulatorLabel[] = ['empty', 'walking', 'sitting', 'lying', 'fall', 'unknown'];

const DEFAULT_SEQUENCE: SimulatorSequenceItem[] = [
  { label: 'walking', duration_frames: 50 },
  { label: 'sitting', duration_frames: 30 },
  { label: 'fall', duration_frames: 60 },
  { label: 'lying', duration_frames: 80 },
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return '操作失败，请检查后端服务';
}

function getSimulatorStatus(status: BackendStatus | null) {
  if (!status) return null;
  const simulator = status.simulator ?? status.simulator_status ?? status;
  return simulator;
}

function SimulatorControl({ status, onStatusRefresh }: SimulatorControlProps) {
  const [room, setRoom] = useState('bedroom');
  const [deviceId, setDeviceId] = useState('sim-node-001');
  const [activeLabel, setActiveLabel] = useState<SimulatorLabel | ''>('');
  const [isOperating, setIsOperating] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [currentSequence, setCurrentSequence] = useState<SimulatorSequenceItem[] | null>(null);

  const simulatorStatus = useMemo(() => getSimulatorStatus(status), [status]);

  const runOperation = async (operation: () => Promise<unknown>, successMessage: string) => {
    setIsOperating(true);
    setNotice('');
    setErrorMessage('');

    try {
      await operation();
      const nextStatus = await getBackendStatus();
      onStatusRefresh?.(nextStatus);
      setNotice(successMessage);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsOperating(false);
    }
  };

  const handleLabelClick = (label: SimulatorLabel) => {
    setActiveLabel(label);
    void runOperation(() => sendSimulatorLabel(label), `已切换模拟状态：${label}`);
  };

  const handleRoomSubmit = () => {
    const value = room.trim();
    if (!value) {
      setErrorMessage('room 不能为空');
      return;
    }

    void runOperation(() => setSimulatorRoom(value), `已切换房间：${value}`);
  };

  const handleDeviceSubmit = () => {
    const value = deviceId.trim();
    if (!value) {
      setErrorMessage('device_id 不能为空');
      return;
    }

    void runOperation(() => setSimulatorDevice(value), `已切换设备：${value}`);
  };

  const handleSequenceRefresh = async () => {
    setIsOperating(true);
    setNotice('');
    setErrorMessage('');

    try {
      const sequence = await getSimulatorSequence();
      setCurrentSequence(sequence);
      const nextStatus = await getBackendStatus();
      onStatusRefresh?.(nextStatus);
      setNotice('当前 sequence 已刷新');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsOperating(false);
    }
  };

  return (
    <section className="simulator-panel" aria-label="仿真控制台">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Simulator</p>
          <h2>仿真控制台</h2>
        </div>
        <button type="button" onClick={() => void runOperation(getBackendStatus, '状态已刷新')} disabled={isOperating}>
          刷新状态
        </button>
      </div>

      <div className="simulator-section">
        <p className="panel-label">模拟状态</p>
        <div className="label-buttons">
          {SIMULATOR_LABELS.map((label) => (
            <button
              type="button"
              key={label}
              className={activeLabel === label ? 'control-button control-button--active' : 'control-button'}
              onClick={() => handleLabelClick(label)}
              disabled={isOperating}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="control-grid">
        <label className="field-group">
          <span>room</span>
          <input value={room} onChange={(event) => setRoom(event.target.value)} placeholder="bedroom" />
          <button type="button" onClick={handleRoomSubmit} disabled={isOperating}>
            应用房间
          </button>
        </label>

        <label className="field-group">
          <span>device_id</span>
          <input value={deviceId} onChange={(event) => setDeviceId(event.target.value)} placeholder="sim-node-001" />
          <button type="button" onClick={handleDeviceSubmit} disabled={isOperating}>
            应用设备
          </button>
        </label>
      </div>

      <div className="sequence-panel">
        <div>
          <p className="panel-label">默认场景序列</p>
          <pre>{JSON.stringify(DEFAULT_SEQUENCE, null, 2)}</pre>
        </div>
        <div className="sequence-actions">
          <button
            type="button"
            onClick={() =>
              void runOperation(async () => {
                await setSimulatorSequence(DEFAULT_SEQUENCE);
                setCurrentSequence(DEFAULT_SEQUENCE);
              }, '默认场景序列已加载')
            }
            disabled={isOperating}
          >
            加载默认序列
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              void runOperation(async () => {
                await clearSimulatorSequence();
                setCurrentSequence([]);
              }, '场景序列已清除')
            }
            disabled={isOperating}
          >
            清除 sequence
          </button>
          <button type="button" className="secondary-button" onClick={() => void handleSequenceRefresh()} disabled={isOperating}>
            查看 sequence
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => void runOperation(resetDetector, 'Detector 已重置')}
            disabled={isOperating}
          >
            重置 detector
          </button>
        </div>
      </div>

      {notice && <p className="success-text">{notice}</p>}
      {errorMessage && <p className="error-text">{errorMessage}</p>}

      <div className="simulator-status">
        <p className="panel-label">当前 simulator 状态</p>
        <pre>{simulatorStatus ? JSON.stringify(simulatorStatus, null, 2) : '等待 /api/status 返回...'}</pre>
      </div>

      <div className="simulator-status">
        <p className="panel-label">当前 sequence</p>
        <pre>{currentSequence ? JSON.stringify(currentSequence, null, 2) : '点击“查看 sequence”获取当前序列'}</pre>
      </div>
    </section>
  );
}

export default SimulatorControl;
