import type { StationId } from '../domain/types';
import { Inspector } from '../features/Inspector';

/** Right dock for the selected machine; a layout column, never an overlay. */
export function InspectorDock({ id, width }: { id: StationId; width: number }) {
  return (
    <aside className="insp-dock" style={{ width }} aria-label="Machine inspector">
      <Inspector id={id} />
    </aside>
  );
}
