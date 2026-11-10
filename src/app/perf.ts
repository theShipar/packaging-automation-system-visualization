/** User-timing marks for profiling. Recorded only with ?perf=1, so normal runs keep the buffer empty. */
export const PERF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('perf');

export function mark(name: string) {
  if (PERF) performance.mark(name);
}

export function measure(name: string, start: string) {
  if (!PERF) return;
  try {
    performance.measure(name, start);
  } catch {
    /* start mark was cleared between runs */
  }
}
