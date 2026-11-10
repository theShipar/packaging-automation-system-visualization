import { useContext, type ReactNode } from 'react';
import { DrawerTitle } from '../workspace/drawerContext';
import { SimBadge } from './Status';

/** Inside a tool drawer the drawer header already names the tool and carries the simulation label. */
export function PageHead({ crumbs, title, sub, actions }: { crumbs: string; title: string; sub?: ReactNode; actions?: ReactNode }) {
  const drawer = useContext(DrawerTitle);
  const showTitle = drawer !== title;
  return (
    <header className={`page-head${drawer ? ' in-drawer' : ''}`}>
      <div style={{ minWidth: 0 }}>
        {!drawer && <div className="crumbs">{crumbs}</div>}
        {showTitle && <h3 className="page-title">{title}</h3>}
        <div className="row wrap page-meta">
          {!drawer && <SimBadge />}
          {sub && <span className="sub">{sub}</span>}
        </div>
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </header>
  );
}

export function Kpi({ t, v, unit, n }: { t: string; v: ReactNode; unit?: string; n?: ReactNode }) {
  return (
    <div className="card kpi">
      <span className="kpi-t">{t}</span>
      <span className="kpi-v num">
        {v}
        {unit && <span className="unit">{unit}</span>}
      </span>
      {n && <span className="kpi-n">{n}</span>}
    </div>
  );
}

export const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '—');
export const pct = (v: number | null, d = 1) => (v === null ? '—' : `${(v * 100).toFixed(d)}%`);
