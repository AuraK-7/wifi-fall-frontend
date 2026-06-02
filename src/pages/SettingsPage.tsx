import { useEffect, useState, useCallback } from 'react';
import {
  Card, Form, Select, Input, Button, Descriptions, Space, Radio, Typography, Row, Col, Tag,
} from 'antd';
import { SwapOutlined, ReloadOutlined, WarningOutlined, ApiOutlined, ThunderboltOutlined } from '@ant-design/icons';
import {
  getBackendStatus, getModelStatus, switchToCsvSource, switchToEnetFallSource,
  updateDetectorMode, resetDetector,
} from '../api/client';
import { useAppStore } from '../store';
import { getThemeColors, fontFamily } from '../styles/tokens';
import type { ActivityLabel, DetectorMode } from '../types/csi';

const { Text } = Typography;

const CSV_LABEL_OPTIONS: ActivityLabel[] = ['empty', 'walking', 'sitting', 'lying', 'fall', 'non_fall', 'unknown'];

export default function SettingsPage() {
  const dm = useAppStore(s => s.darkMode);
  const backendStatus = useAppStore(s => s.backendStatus);
  const modelStatus = useAppStore(s => s.modelStatus);
  const currentSource = useAppStore(s => s.currentSource);
  const currentDetectorMode = useAppStore(s => s.currentDetectorMode);
  const setBackendStatus = useAppStore(s => s.setBackendStatus);
  const setModelStatus = useAppStore(s => s.setModelStatus);
  const setCurrentSource = useAppStore(s => s.setCurrentSource);
  const setCurrentDetectorMode = useAppStore(s => s.setCurrentDetectorMode);
  const c = getThemeColors(dm);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Data source form
  const [srcMode, setSrcMode] = useState<'csv' | 'enetfall'>(currentSource === 'csv' ? 'csv' : 'enetfall');
  const [csvPath, setCsvPath] = useState('data/sample.csv');
  const [csvRoom, setCsvRoom] = useState('room_1');
  const [csvLabel, setCsvLabel] = useState<ActivityLabel>('unknown');
  const [enetfallDataDir, setEnetfallDataDir] = useState('');
  const [enetfallRoom, setEnetfallRoom] = useState('home');
  const [enetfallDatasets, setEnetfallDatasets] = useState('');

  const [detectorMode, setDetectorMode] = useState<DetectorMode>(
    currentDetectorMode === 'simple' ? 'simple' : currentDetectorMode === 'cnn2d' ? 'cnn2d' : 'enetfall'
  );

  const refresh = useCallback(async () => {
    try {
      const [be, mo] = await Promise.all([getBackendStatus(), getModelStatus()]);
      setBackendStatus(be); setModelStatus(mo);
      const m = mo?.active_detector_mode ?? mo?.detector_mode;
      if (m === 'simple' || m === 'enetfall' || m === 'cnn2d') { setDetectorMode(m); setCurrentDetectorMode(m); }
      const s = be?.source?.source_mode;
      if (s === 'csv' || s === 'enetfall') { setSrcMode(s); setCurrentSource(s); }
      // Pre-fill form fields from current source config
      const cs = be?.source?.current_source as Record<string, unknown> | undefined;
      if (cs) {
        if (cs.type === 'enetfall_mat') {
          setEnetfallDataDir((cs.data_dir as string) || '');
          setEnetfallRoom((cs.room as string) || 'home');
          setEnetfallDatasets((cs.dataset_names as string[])?.join(',') || '');
        }
        if (cs.type === 'csv') {
          setCsvPath((cs.csv_path as string) || '');
          setCsvRoom((cs.room as string) || 'room_1');
        }
      }
    } catch { /* ok */ }
  }, [setBackendStatus, setModelStatus, setCurrentDetectorMode, setCurrentSource]);

  useEffect(() => { refresh(); }, [refresh]);

  const applySource = async () => {
    setBusy(true); setMsg('');
    try {
      if (srcMode === 'csv') {
        await switchToCsvSource({ csv_path: csvPath, room: csvRoom, device_id: 'csv-node-001', label: csvLabel });
      } else {
        await switchToEnetFallSource({
          data_dir: enetfallDataDir.trim() || undefined,
          dataset_names: enetfallDatasets ? enetfallDatasets.split(/[\n,]/).map(s => s.trim()).filter(Boolean) : undefined,
          device_id: 'enetfall-node-001', room: enetfallRoom,
        });
      }
      setCurrentSource(srcMode);
      setMsg(`已切换为 ${srcMode === 'csv' ? 'CSV' : 'ENetFall'} 数据源`);
      await refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : '切换失败'); }
    finally { setBusy(false); }
  };

  const applyDetector = async () => {
    setBusy(true); setMsg('');
    try {
      await updateDetectorMode({ mode: detectorMode });
      setCurrentDetectorMode(detectorMode);
      setMsg(`检测器已切换为 ${detectorMode}`);
      await refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : '切换失败'); }
    finally { setBusy(false); }
  };

  const resetDet = async () => {
    setBusy(true); setMsg('');
    try { await resetDetector(); setMsg('检测器已重置'); await refresh(); }
    catch (e) { setMsg(e instanceof Error ? e.message : '重置失败'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ fontFamily: fontFamily.mono }}>
      {msg && <div style={{ fontSize: 11, color: msg.includes('失败') ? '#ef4444' : '#22c55e', padding: '4px 8px', marginBottom: 8 }}>{msg}</div>}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card size="small" title={<Space><ApiOutlined style={{ color: c.status.info }} /><span style={{ fontFamily: fontFamily.mono }}>数据源</span></Space>}
            extra={<Space size={4}><Tag color="blue" style={{ fontSize: 10, fontFamily: fontFamily.mono }}>{currentSource}</Tag><Button size="small" type="text" icon={<ReloadOutlined />} onClick={refresh} /></Space>}
            styles={{ body: { padding: '12px 16px' } }}>
            <Form layout="vertical" size="small">
              <Form.Item label={<span style={{ fontSize: 11, fontFamily: fontFamily.mono }}>模式</span>}>
                <Radio.Group value={srcMode} onChange={e => setSrcMode(e.target.value)} size="small">
                  <Radio.Button value="enetfall" style={{ fontFamily: fontFamily.mono }}>ENetFall</Radio.Button>
                  <Radio.Button value="csv" style={{ fontFamily: fontFamily.mono }}>CSV</Radio.Button>
                </Radio.Group>
              </Form.Item>
              {srcMode === 'csv' && <>
                <Form.Item label={<span style={{ fontSize: 11, fontFamily: fontFamily.mono }}>CSV 路径</span>}><Input size="small" value={csvPath} onChange={e => setCsvPath(e.target.value)} /></Form.Item>
                <Row gutter={8}><Col span={12}><Form.Item label={<span style={{ fontSize: 11, fontFamily: fontFamily.mono }}>房间</span>}><Input size="small" value={csvRoom} onChange={e => setCsvRoom(e.target.value)} /></Form.Item></Col>
                  <Col span={12}><Form.Item label={<span style={{ fontSize: 11, fontFamily: fontFamily.mono }}>标签</span>}><Select size="small" value={csvLabel} onChange={setCsvLabel} options={CSV_LABEL_OPTIONS.map(l => ({ value: l, label: l }))} /></Form.Item></Col></Row>
              </>}
              {srcMode === 'enetfall' && <>
                <Form.Item label={<span style={{ fontSize: 11, fontFamily: fontFamily.mono }}>数据目录（留空用默认）</span>}><Input size="small" value={enetfallDataDir} onChange={e => setEnetfallDataDir(e.target.value)} /></Form.Item>
                <Form.Item label={<span style={{ fontSize: 11, fontFamily: fontFamily.mono }}>数据集（逗号分隔，留空用全部）</span>}><Input size="small" value={enetfallDatasets} onChange={e => setEnetfallDatasets(e.target.value)} /></Form.Item>
                <Form.Item label={<span style={{ fontSize: 11, fontFamily: fontFamily.mono }}>房间</span>}><Input size="small" value={enetfallRoom} onChange={e => setEnetfallRoom(e.target.value)} /></Form.Item>
              </>}
              <Button type="primary" size="small" icon={<SwapOutlined />} loading={busy} onClick={applySource} block style={{ fontFamily: fontFamily.mono }}>应用</Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card size="small" title={<Space><ThunderboltOutlined style={{ color: c.status.warning }} /><span style={{ fontFamily: fontFamily.mono }}>检测器</span></Space>}
            extra={<Tag color="geekblue" style={{ fontSize: 10, fontFamily: fontFamily.mono }}>{currentDetectorMode}</Tag>}
            styles={{ body: { padding: '12px 16px' } }}>
            <Form layout="vertical" size="small">
              <Form.Item label={<span style={{ fontSize: 11, fontFamily: fontFamily.mono }}>模式</span>}>
                <Select size="small" value={detectorMode} onChange={setDetectorMode}
                  options={[
                    { value: 'cnn2d', label: '2D-CNN (论文模型, 0.24M)' },
                    { value: 'enetfall', label: 'ENetFall (EfficientNet-B0)' },
                    { value: 'simple', label: 'Simple (阈值法)' },
                  ]} />
              </Form.Item>
              <Space>
                <Button type="primary" size="small" icon={<SwapOutlined />} loading={busy} onClick={applyDetector} style={{ fontFamily: fontFamily.mono }}>应用</Button>
                <Button danger size="small" icon={<WarningOutlined />} loading={busy} onClick={resetDet} style={{ fontFamily: fontFamily.mono }}>重置</Button>
              </Space>
            </Form>
          </Card>

          <Card size="small" style={{ marginTop: 12 }}
            title={<span style={{ fontFamily: fontFamily.mono }}>模型详情</span>}
            styles={{ body: { padding: '10px 14px' } }}>
            {modelStatus ? (
              <Descriptions column={1} size="small" colon={false}
                labelStyle={{ color: c.text.muted, fontSize: 10, fontFamily: fontFamily.mono, padding: '2px 0' }}
                contentStyle={{ color: c.text.primary, fontSize: 10, fontFamily: fontFamily.mono, padding: '2px 0' }}>
                <Descriptions.Item label="名称">{modelStatus.model_name}</Descriptions.Item>
                <Descriptions.Item label="状态"><Tag color={modelStatus.model_loaded ? 'success' : 'error'}>{modelStatus.model_loaded ? '已加载' : '未加载'}</Tag></Descriptions.Item>
                <Descriptions.Item label="设备">{modelStatus.device}</Descriptions.Item>
                <Descriptions.Item label="类别">{modelStatus.class_names?.join(', ') ?? '--'}</Descriptions.Item>
                <Descriptions.Item label="输入">{modelStatus.input_shape?.join(' × ') ?? '--'}</Descriptions.Item>
                <Descriptions.Item label="路径"><Text style={{ fontSize: 10, wordBreak: 'break-all' }}>{modelStatus.model_path}</Text></Descriptions.Item>
                {modelStatus.load_error && <Descriptions.Item label="错误"><Text type="danger">{modelStatus.load_error}</Text></Descriptions.Item>}
              </Descriptions>
            ) : <Text type="secondary" style={{ fontSize: 10, fontFamily: fontFamily.mono }}>模型状态不可用</Text>}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
