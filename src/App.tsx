import { useMemo } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import AppLayout from './layouts/AppLayout';
import AnalysisPanel from './pages/AnalysisPanel';
import IncidentsPage from './pages/IncidentsPage';
import SettingsPage from './pages/SettingsPage';
import ReplayPage from './pages/ReplayPage';
import ModelMetricsPage from './pages/ModelMetricsPage';
import MobileApp from './pages/mobile/MobileApp';
import DemoPage from './pages/DemoPage';
import { antdThemeDark, antdThemeLight } from './styles/tokens';

function StandaloneWrapper({ children }: { children: React.ReactNode }) {
  const themeConfig = useMemo(() => ({
    algorithm: theme.darkAlgorithm,
    ...antdThemeDark,
  }), []);
  return (
    <ConfigProvider theme={themeConfig}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<AnalysisPanel />} />
          <Route path="/incidents" element={<IncidentsPage />} />
          <Route path="/metrics" element={<ModelMetricsPage />} />
          <Route path="/replay" element={<ReplayPage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/mobile" element={<StandaloneWrapper><MobileApp /></StandaloneWrapper>} />
      </Routes>
    </HashRouter>
  );
}
