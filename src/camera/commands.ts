import type { StationId } from '../domain/types';
import { CONTENT_BOUNDS, GEOMETRY } from '../vector/sceneModel';
import { workspace } from '../workspace/workspaceStore';
import { inflate, type Bounds } from './camera';
import { camera } from './controller';

/** Station silhouette plus a little belt context on each side. */
export const stationBounds = (id: StationId): Bounds => inflate(GEOMETRY[id].bounds, 0.18);

/** A component with enough surrounding machine to read where it sits. */
export function componentBounds(id: StationId, comp: string): Bounds {
  const b = GEOMETRY[id].compBounds[comp];
  return b ? inflate(b, 0.9) : stationBounds(id);
}

export const hasGeometry = (id: StationId, comp: string) => Boolean(GEOMETRY[id].compBounds[comp]);

export function focusStation(id: StationId) {
  camera.focusBounds(stationBounds(id), 'focus-station', id);
}

export function focusComponent(id: StationId, comp: string) {
  if (!hasGeometry(id, comp)) return focusStation(id);
  camera.focusBounds(componentBounds(id, comp), 'focus-component', `${id}/${comp}`);
}

export function focusSelection() {
  const w = workspace.get();
  if (!w.station) return;
  if (w.comp) focusComponent(w.station, w.comp);
  else focusStation(w.station);
}

camera.setContent(CONTENT_BOUNDS);
camera.selectionBounds = () => {
  const w = workspace.get();
  if (!w.station) return null;
  return w.comp && hasGeometry(w.station, w.comp) ? GEOMETRY[w.station].compBounds[w.comp] : GEOMETRY[w.station].bounds;
};

let lastSel = '';
workspace.subscribe(() => {
  const w = workspace.get();
  const key = `${w.station ?? ''}/${w.comp ?? ''}`;
  if (key === lastSel) return;
  lastSel = key;
  const b = camera.selectionBounds();
  if (b) camera.reveal(b);
});
