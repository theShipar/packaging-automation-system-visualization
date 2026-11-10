import type { Session } from '../domain/types';

const DB = 'lineflow';
const STORE = 'sessions';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSession(s: Session): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ savedAt: new Date().toISOString(), session: s }, 'current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadSession(): Promise<{ savedAt: string; session: Session } | null> {
  try {
    const db = await openDb();
    const out = await new Promise<{ savedAt: string; session: Session } | null>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get('current');
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return out;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete('current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export function pref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`lf.${key}`);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function setPref(key: string, value: unknown) {
  try {
    localStorage.setItem(`lf.${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable: preferences stay in memory */
  }
}
