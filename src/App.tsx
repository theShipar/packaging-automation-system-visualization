import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { store, useUi } from './app/store';
import { TopBar } from './app/TopBar';
import { AnalyticsPage } from './pages/Analytics';
import { AssetDetailPage, AssetsPage } from './pages/Assets';
import { BatchDetailPage, BatchesPage } from './pages/Batches';
import { EventsPage } from './pages/Events';
import { MaintenancePage } from './pages/Maintenance';
import { ProductionPage } from './pages/Production';
import { QualityPage } from './pages/Quality';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { ScenarioRunPage, SimulationPage } from './pages/Simulation';
import { IcoAsset, IcoBatch, IcoChart, IcoCheck, IcoEvents, IcoGear, IcoLab, IcoLine, IcoReport, IcoWrench } from './ui/Icons';
import { useReducedMotionSync } from './vector/Scene';

const NAV = [
  { to: '/production', label: 'Production', icon: <IcoLine /> },
  { to: '/production/batches', label: 'Batches', icon: <IcoBatch /> },
  { to: '/simulation', label: 'Scenario lab', icon: <IcoLab /> },
  { to: '/analytics', label: 'Analytics', icon: <IcoChart /> },
];
const OPS = [
  { to: '/assets', label: 'Assets', icon: <IcoAsset /> },
  { to: '/events', label: 'Events', icon: <IcoEvents /> },
  { to: '/maintenance', label: 'Maintenance', icon: <IcoWrench /> },
  { to: '/quality', label: 'Quality', icon: <IcoCheck /> },
  { to: '/reports', label: 'Reports', icon: <IcoReport /> },
  { to: '/settings', label: 'Settings', icon: <IcoGear /> },
];

export function App() {
  useReducedMotionSync();
  useUi();
  return (
    <div className="app">
      <nav className="rail" aria-label="Primary">
        <div className="rail-inner">
          <div className="brand" title="LineFlow · Northfield Packaging Campus, Line 01">
            <div className="brand-mark" aria-hidden />
          </div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/production'} className={({ isActive }) => `nav-a${isActive ? ' active' : ''}`} aria-label={n.label}>
              {n.icon}
              <span className="nav-tip">{n.label}</span>
            </NavLink>
          ))}
          <div className="rail-sep" aria-hidden />
          {OPS.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-a${isActive ? ' active' : ''}`} aria-label={n.label}>
              {n.icon}
              <span className="nav-tip">{n.label}</span>
            </NavLink>
          ))}
        </div>
        <div className="rail-foot" title="Simulated plant. No real equipment is connected or controlled.">
          <span className="sim-dot">SIM</span>
        </div>
      </nav>
      <main className="main">
        <TopBar />
        <Routes>
          <Route path="/" element={<Navigate to="/production" replace />} />
          <Route path="/production" element={<ProductionPage />} />
          <Route path="/production/batches" element={<BatchesPage />} />
          <Route path="/production/batches/:id" element={<BatchDetailPage />} />
          <Route path="/simulation" element={<SimulationPage />} />
          <Route path="/simulation/:id" element={<ScenarioRunPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/assets/:id" element={<AssetDetailPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route path="/quality" element={<QualityPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<div className="page"><h1>Not found</h1><NavLink to="/production">Back to production</NavLink></div>} />
        </Routes>
      </main>
      <div className="toasts" aria-live="polite">
        {store.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
