import { createContext } from 'react';

/** Pages render inside the tool drawer; PageHead reads this to avoid repeating the drawer title. */
export const DrawerTitle = createContext<string | null>(null);
