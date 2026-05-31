import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Typography, theme, Space, Button, Tooltip, Badge, ConfigProvider, App as AntApp } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined, AlertOutlined, PlayCircleOutlined, SettingOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, SoundOutlined, SoundFilled,
  FullscreenOutlined, FullscreenExitOutlined, ApiOutlined, WifiOutlined,
  ThunderboltOutlined, ReloadOutlined, SunOutlined, MoonOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../store';
import { useRealtimeStore } from '../hooks/useRealtimeStore';
import { getThemeColors, antdThemeDark, antdThemeLight } from '../styles/tokens';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

function HeaderStatus() {
  const apiState = useAppStore((s) => s.apiState);
  const wsState = useAppStore((s) => s.wsState);
  const fps = useAppStore((s) => s.currentFps);
  const darkMode = useAppStore((s) => s.darkMode);
  const c = getThemeColors(darkMode);
  const { reconnectWs } = useRealtimeStore();

  return (
    <Space size={14} style={{ fontSize: 11 }}>
      <Tooltip title={`API ${apiState === 'online' ? '已连接' : '检查中...'}`}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <ApiOutlined style={{ fontSize: 10, color: apiState === 'online' ? c.status.success : c.text.muted }} />
          <Badge status={apiState === 'online' ? 'success' : apiState === 'checking' ? 'processing' : 'error'} />
          <Text style={{ color: c.text.secondary, fontSize: 11 }}>API</Text>
        </span>
      </Tooltip>
      <Tooltip title={`WebSocket ${wsState === 'online' ? '已连接' : '连接中...'}`}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <WifiOutlined style={{ fontSize: 10, color: wsState === 'online' ? c.status.success : c.text.muted }} />
          <Badge status={wsState === 'online' ? 'success' : wsState === 'checking' ? 'processing' : 'error'} />
          <Text style={{ color: c.text.secondary, fontSize: 11 }}>WS</Text>
        </span>
      </Tooltip>
      <Tooltip title="接收帧率">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'monospace' }}>
          <ThunderboltOutlined style={{ fontSize: 10, color: fps >= 1 ? c.status.success : c.status.warning }} />
          <Text style={{ color: fps >= 1 ? c.status.success : c.status.warning, fontSize: 10 }}>
            {wsState === 'online' ? `${fps.toFixed(0)} fps` : '--'}
          </Text>
        </span>
      </Tooltip>
      {wsState === 'offline' && (
        <Tooltip title="重连 WebSocket">
          <Button size="small" type="text" icon={<ReloadOutlined />} onClick={reconnectWs}
            style={{ color: c.status.warning }}>重连</Button>
        </Tooltip>
      )}
    </Space>
  );
}

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const selectedKey = location.pathname.startsWith('/incidents') ? '/incidents'
    : location.pathname.startsWith('/replay') ? '/replay'
    : location.pathname.startsWith('/settings') ? '/settings'
    : '/dashboard';

  const menuItems: MenuProps['items'] = useMemo(() => [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '实时监控' },
    { key: '/incidents', icon: <AlertOutlined />, label: '事件中心' },
    { key: '/replay', icon: <PlayCircleOutlined />, label: '3D 回放' },
    { key: '/settings', icon: <SettingOutlined />, label: '系统配置' },
  ], []);

  const handleClick: MenuProps['onClick'] = (e) => {
    navigate(String(e.key), { replace: false });
  };

  return (
    <Sider
      collapsible collapsed={collapsed} onCollapse={setCollapsed}
      breakpoint="lg" collapsedWidth={64} width={200}
      trigger={null}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid inherit', marginBottom: 8, flexShrink: 0 }}>
          <Text strong style={{ fontSize: collapsed ? 13 : 15, whiteSpace: 'nowrap' }}>
            {collapsed ? 'WFG' : 'WiFi Fall Guard'}
          </Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={handleClick}
          triggerSubMenuAction="click"
          onSelect={(info) => navigate(String(info.key), { replace: false })}
          style={{ background: 'transparent', borderInlineEnd: 'none', flex: 1, overflow: 'auto' }}
        />
        <div style={{ display: 'flex', justifyContent: 'center', padding: 12, flexShrink: 0, borderTop: '1px solid inherit' }}>
          <button type="button" onClick={() => setCollapsed(!collapsed)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, padding: 4 }}>
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
        </div>
      </div>
    </Sider>
  );
}

export default function AppLayout() {
  const fullscreen = useAppStore((s) => s.fullscreen);
  const setFullscreen = useAppStore((s) => s.setFullscreen);
  const muted = useAppStore((s) => s.muted);
  const setMuted = useAppStore((s) => s.setMuted);
  const darkMode = useAppStore((s) => s.darkMode);
  const setDarkMode = useAppStore((s) => s.setDarkMode);
  const location = useLocation();
  const locationKey = location.pathname;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const themeConfig = useMemo(() => ({
    algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
    ...(darkMode ? antdThemeDark : antdThemeLight),
  }), [darkMode]);

  return (
    <ConfigProvider theme={themeConfig}>
      <AntApp>
        <Layout style={{ minHeight: '100vh' }}>
          {!fullscreen && <Sidebar />}
          <Layout>
            {!fullscreen && (
              <Header style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 20px', height: 46, lineHeight: '46px',
              }}>
                <Text style={{ fontSize: 13 }}>WiFi 信号摔倒监测中心</Text>
                <HeaderStatus />
                <Space size={4}>
                  <Tooltip title={darkMode ? '切换浅色' : '切换深色'}>
                    <Button size="small" type="text"
                      icon={darkMode ? <SunOutlined /> : <MoonOutlined />}
                      onClick={() => setDarkMode(!darkMode)} />
                  </Tooltip>
                  <Tooltip title={muted ? '取消静音' : '静音通知'}>
                    <Button size="small" type="text"
                      icon={muted ? <SoundFilled /> : <SoundOutlined />}
                      onClick={() => setMuted(!muted)} />
                  </Tooltip>
                  <Button size="small" type="text"
                    icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                    onClick={() => setFullscreen(!fullscreen)} />
                </Space>
              </Header>
            )}
            <Content style={fullscreen ? { padding: 0, overflow: 'auto' } : { padding: '12px 20px', overflow: 'auto' }}>
              <ErrorBoundaryWrapper key={locationKey}>
                <Outlet />
              </ErrorBoundaryWrapper>
            </Content>
          </Layout>
        </Layout>
      </AntApp>
    </ConfigProvider>
  );
}

class ErrorBoundaryWrapper extends React.Component<{ children: React.ReactNode }> {
  state = { hasError: false, error: null as any };
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any, info: any) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, background: '#fff', borderRadius: 8 }}>
          <h3>发生错误，页面加载失败。</h3>
          <p>请尝试刷新或返回其他页面。错误已记录到控制台。</p>
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}
