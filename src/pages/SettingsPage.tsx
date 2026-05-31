import { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Form,
  Select,
  Input,
  Button,
  Descriptions,
  Modal,
  message,
  Space,
  Radio,
  Typography,
  Row,
  Col,
  Tag,
} from 'antd';
import {
  SwapOutlined,
  ReloadOutlined,
  WarningOutlined,
  ApiOutlined,
  ThunderboltOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import {
  getBackendStatus,
  getModelStatus,
  switchToCsvSource,
  switchToEnetFallSource,
  updateDetectorMode,
  resetDetector,
} from '../api/client';
import { useAppStore } from '../store';
import { getThemeColors } from '../styles/tokens';
import type { ActivityLabel, DetectorMode } from '../types/csi';

const { Text, Title } = Typography;

const CSV_LABEL_OPTIONS: ActivityLabel[] = [
  'empty', 'walking', 'sitting', 'lying', 'fall', 'non_fall', 'unknown',
];

export default function SettingsPage() {
  const darkMode = useAppStore((s) => s.darkMode);
  const backendStatus = useAppStore((s) => s.backendStatus);
  const modelStatus = useAppStore((s) => s.modelStatus);
  const currentSource = useAppStore((s) => s.currentSource);
  const currentDetectorMode = useAppStore((s) => s.currentDetectorMode);
  const setBackendStatus = useAppStore((s) => s.setBackendStatus);
  const setModelStatus = useAppStore((s) => s.setModelStatus);
  const setCurrentSource = useAppStore((s) => s.setCurrentSource);
  const setCurrentDetectorMode = useAppStore((s) => s.setCurrentDetectorMode);

  const c = getThemeColors(darkMode);
  const [isOperating, setIsOperating] = useState(false);

  // Data source form
  const [sourceMode, setSourceMode] = useState<'csv' | 'enetfall'>('enetfall');
  const [csvPath, setCsvPath] = useState('data/sample.csv');
  const [csvRoom, setCsvRoom] = useState('room_1');
  const [csvDeviceId, setCsvDeviceId] = useState('csv-node-001');
  const [csvLabel, setCsvLabel] = useState<ActivityLabel>('unknown');
  const [enetfallDataDir, setEnetfallDataDir] = useState('');
  const [enetfallRoom, setEnetfallRoom] = useState('home');
  const [enetfallDeviceId, setEnetfallDeviceId] = useState('enetfall-node-001');
  const [enetfallDatasets, setEnetfallDatasets] = useState('');

  // Detector
  const [detectorMode, setDetectorMode] = useState<DetectorMode>('enetfall');

  const refreshStatus = useCallback(async () => {
    try {
      const [backend, model] = await Promise.all([getBackendStatus(), getModelStatus()]);
      setBackendStatus(backend);
      setModelStatus(model);
      const mode = model?.active_detector_mode ?? model?.detector_mode;
      if (mode === 'simple' || mode === 'enetfall') {
        setDetectorMode(mode);
        setCurrentDetectorMode(mode);
      }
      const sm = backend?.source?.source_mode;
      if (sm === 'csv' || sm === 'enetfall') {
        setSourceMode(sm);
        setCurrentSource(sm);
      }
    } catch {
      // handled by notification in DashboardPage
    }
  }, [setBackendStatus, setModelStatus, setCurrentDetectorMode, setCurrentSource]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleSourceSwitch = async () => {
    Modal.confirm({
      title: '确认切换数据源',
      content: `切换到 ${sourceMode === 'csv' ? 'CSV 回放' : 'ENetFall 回放'} 数据源？切换后检测器将使用新数据源。`,
      okText: '确认切换',
      cancelText: '取消',
      onOk: async () => {
        setIsOperating(true);
        try {
          if (sourceMode === 'csv') {
            await switchToCsvSource({ csv_path: csvPath, room: csvRoom, device_id: csvDeviceId, label: csvLabel });
          } else {
            await switchToEnetFallSource({
              data_dir: enetfallDataDir.trim() || undefined,
              dataset_names: enetfallDatasets ? enetfallDatasets.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) : undefined,
              device_id: enetfallDeviceId,
              room: enetfallRoom,
            });
          }
          setCurrentSource(sourceMode);
          message.success(`已切换为 ${sourceMode === 'csv' ? 'CSV' : 'ENetFall'} 数据源`);
          await refreshStatus();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '数据源切换失败');
        } finally {
          setIsOperating(false);
        }
      },
    });
  };

  const handleDetectorSwitch = async () => {
    Modal.confirm({
      title: '切换检测器模式',
      content: `切换到 ${detectorMode === 'enetfall' ? 'ENetFall (EfficientNet-B0)' : 'Simple (阈值法)'} 检测器？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        setIsOperating(true);
        try {
          await updateDetectorMode({ mode: detectorMode });
          setCurrentDetectorMode(detectorMode);
          message.success(`检测器已切换为 ${detectorMode}`);
          await refreshStatus();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '切换检测器失败');
        } finally {
          setIsOperating(false);
        }
      },
    });
  };

  const handleReset = async () => {
    Modal.confirm({
      title: '重置检测器',
      content: '此操作将清空检测器内部状态和运行时数据。确认继续？',
      okText: '确认重置',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setIsOperating(true);
        try {
          await resetDetector();
          message.success('检测器已重置');
          await refreshStatus();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '重置失败');
        } finally {
          setIsOperating(false);
        }
      },
    });
  };

  // Shared card props for visual consistency
  const cardBodyStyle = { padding: '16px 20px' };

  return (
    <div>
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0, color: c.text.primary }}>系统配置</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            管理数据源、检测模型与系统参数
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={refreshStatus}>
          刷新状态
        </Button>
      </div>

      <Row gutter={[20, 20]}>
        {/* ── Data Source ────────────────────────────────────────────── */}
        <Col xs={24} lg={12}>
          <Card
            title={<Space><ApiOutlined style={{ color: c.status.info }} /><Text strong>数据源配置</Text></Space>}
            extra={<Tag color="blue" style={{ fontSize: 11 }}>当前: {currentSource}</Tag>}
            styles={{ body: cardBodyStyle }}
          >
            <Form layout="vertical" size="middle">
              <Form.Item label="数据源模式">
                <Radio.Group value={sourceMode} onChange={(e) => setSourceMode(e.target.value)}>
                  <Radio.Button value="enetfall">ENetFall 回放</Radio.Button>
                  <Radio.Button value="csv">CSV 回放</Radio.Button>
                </Radio.Group>
              </Form.Item>

              {sourceMode === 'csv' && (
                <>
                  <Form.Item label="CSV 文件路径">
                    <Input value={csvPath} onChange={(e) => setCsvPath(e.target.value)} placeholder="data/sample.csv" />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item label="房间">
                        <Input value={csvRoom} onChange={(e) => setCsvRoom(e.target.value)} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="设备 ID">
                        <Input value={csvDeviceId} onChange={(e) => setCsvDeviceId(e.target.value)} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item label="标签">
                    <Select value={csvLabel} onChange={setCsvLabel} options={CSV_LABEL_OPTIONS.map((l) => ({ value: l, label: l }))} />
                  </Form.Item>
                </>
              )}

              {sourceMode === 'enetfall' && (
                <>
                  <Form.Item label="数据目录">
                    <Input value={enetfallDataDir} onChange={(e) => setEnetfallDataDir(e.target.value)} placeholder="默认: data/ENetFall_dataset_trained_networks" />
                  </Form.Item>
                  <Form.Item label="数据集名称 (一行一个或逗号分隔)">
                    <Input.TextArea value={enetfallDatasets} onChange={(e) => setEnetfallDatasets(e.target.value)}
                      placeholder="dataset_home_lab(L).mat" rows={2} />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item label="房间">
                        <Input value={enetfallRoom} onChange={(e) => setEnetfallRoom(e.target.value)} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="设备 ID">
                        <Input value={enetfallDeviceId} onChange={(e) => setEnetfallDeviceId(e.target.value)} />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              )}

              <Button type="primary" icon={<SwapOutlined />} loading={isOperating} onClick={handleSourceSwitch} block>
                应用数据源
              </Button>
            </Form>
          </Card>
        </Col>

        {/* ── Detector ───────────────────────────────────────────────── */}
        <Col xs={24} lg={12}>
          <Card
            title={<Space><ThunderboltOutlined style={{ color: c.status.warning }} /><Text strong>检测器配置</Text></Space>}
            extra={<Tag color="geekblue" style={{ fontSize: 11 }}>当前: {currentDetectorMode}</Tag>}
            styles={{ body: cardBodyStyle }}
          >
            <Form layout="vertical" size="middle">
              <Form.Item label="检测器模式">
                <Select value={detectorMode} onChange={setDetectorMode}
                  options={[
                    { value: 'enetfall', label: 'ENetFall (EfficientNet-B0 — 需要 PyTorch)' },
                    { value: 'simple', label: 'Simple (阈值法 — 无需 GPU)' },
                  ]} />
              </Form.Item>
              <Space>
                <Button type="primary" icon={<SwapOutlined />} loading={isOperating} onClick={handleDetectorSwitch}>
                  应用检测器
                </Button>
                <Button danger icon={<WarningOutlined />} loading={isOperating} onClick={handleReset}>
                  重置检测器
                </Button>
              </Space>
            </Form>
          </Card>

          {/* ── Model Info ──────────────────────────────────────────── */}
          <Card
            style={{ marginTop: 20 }}
            title={<Space><InfoCircleOutlined style={{ color: c.text.muted }} /><Text strong>模型详情</Text></Space>}
            styles={{ body: cardBodyStyle }}
          >
            {modelStatus ? (
              <Descriptions column={1} size="small" colon={false}
                labelStyle={{ color: c.text.muted, padding: '4px 0' }}
                contentStyle={{ color: c.text.primary, padding: '4px 0' }}>
                <Descriptions.Item label="模型名称">{modelStatus.model_name}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={modelStatus.model_loaded ? 'success' : 'error'}>
                    {modelStatus.model_loaded ? '已加载' : '未加载'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="运行设备">{modelStatus.device}</Descriptions.Item>
                <Descriptions.Item label="类别数">{modelStatus.num_classes}</Descriptions.Item>
                <Descriptions.Item label="类别名称">{modelStatus.class_names?.join(', ') ?? '--'}</Descriptions.Item>
                <Descriptions.Item label="输入形状">{modelStatus.input_shape?.join(' × ') ?? '--'}</Descriptions.Item>
                <Descriptions.Item label="模型路径">
                  <Text style={{ fontSize: 12, wordBreak: 'break-all' }}>{modelStatus.model_path}</Text>
                </Descriptions.Item>
                {modelStatus.load_error && (
                  <Descriptions.Item label="加载错误">
                    <Text type="danger">{modelStatus.load_error}</Text>
                  </Descriptions.Item>
                )}
              </Descriptions>
            ) : (
              <Text type="secondary">模型状态不可用 — 请确认后端已启动</Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
