import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppShell } from './workspace/AppShell';
import type { Tool } from './workspace/workspaceStore';

/** Old page routes become drawer deep links, so bookmarks and copied links keep working. */
function ToTool({ tool }: { tool: Tool }) {
  const { id } = useParams();
  const loc = useLocation();
  const p = new URLSearchParams(loc.search);
  p.set('tool', tool);
  if (id) p.set('item', id);
  return <Navigate to={{ pathname: '/production', search: `?${p}` }} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/production" element={<AppShell />} />
      <Route path="/production/batches" element={<ToTool tool="batches" />} />
      <Route path="/production/batches/:id" element={<ToTool tool="batches" />} />
      <Route path="/simulation" element={<ToTool tool="scenarios" />} />
      <Route path="/simulation/:id" element={<ToTool tool="scenarios" />} />
      <Route path="/analytics" element={<ToTool tool="analytics" />} />
      <Route path="/assets" element={<ToTool tool="assets" />} />
      <Route path="/assets/:id" element={<ToTool tool="assets" />} />
      <Route path="/events" element={<ToTool tool="events" />} />
      <Route path="/maintenance" element={<ToTool tool="maintenance" />} />
      <Route path="/quality" element={<ToTool tool="quality" />} />
      <Route path="/reports" element={<ToTool tool="reports" />} />
      <Route path="/settings" element={<ToTool tool="settings" />} />
      <Route path="*" element={<Navigate to="/production" replace />} />
    </Routes>
  );
}
