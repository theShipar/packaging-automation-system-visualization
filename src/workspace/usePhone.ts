import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 600px)';

const subscribe = (cb: () => void) => {
  const mq = matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

/** True at the phone breakpoint, where the dock owns mode and layer controls; must match the 600 px block in styles.css. */
export const usePhone = () => useSyncExternalStore(subscribe, () => matchMedia(QUERY).matches);
