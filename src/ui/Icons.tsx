import type { ReactNode } from 'react';

const I = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

export const IcoLine = () => (
  <I>
    <rect x="3" y="14" width="18" height="5" rx="2" />
    <path d="M7 14V9h4v5M14 14V6h4v8" />
  </I>
);
export const IcoBatch = () => (
  <I>
    <path d="M4 7l8-4 8 4-8 4-8-4z" />
    <path d="M4 12l8 4 8-4M4 17l8 4 8-4" />
  </I>
);
export const IcoLab = () => (
  <I>
    <path d="M9 3h6M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4A1.5 1.5 0 0 0 19 19l-5-10V3" />
    <path d="M7.5 15h9" />
  </I>
);
export const IcoChart = () => (
  <I>
    <path d="M4 20V4M4 20h16" />
    <path d="M8 16l4-5 3 3 5-6" />
  </I>
);
export const IcoAsset = () => (
  <I>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </I>
);
export const IcoEvents = () => (
  <I>
    <path d="M4 6h16M4 12h10M4 18h7" />
  </I>
);
export const IcoWrench = () => (
  <I>
    <path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.6-.6-.6-2.6 2.4-2.4z" />
  </I>
);
export const IcoCheck = () => (
  <I>
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </I>
);
export const IcoReport = () => (
  <I>
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5M10 13h6M10 17h6" />
  </I>
);
export const IcoGear = () => (
  <I>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </I>
);
export const IcoPlay = () => (
  <I>
    <path d="M7 4.5v15l12-7.5z" />
  </I>
);
export const IcoPause = () => (
  <I>
    <path d="M8 5v14M16 5v14" />
  </I>
);
export const IcoReset = () => (
  <I>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </I>
);
export const IcoAlert = () => (
  <I>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5M12 18h.01" />
  </I>
);
export const IcoClose = () => (
  <I>
    <path d="M6 6l12 12M18 6L6 18" />
  </I>
);
export const IcoSave = () => (
  <I>
    <path d="M5 3h11l3 3v15H5z" />
    <path d="M8 3v5h7V3M8 21v-7h8v7" />
  </I>
);
export const IcoDownload = () => (
  <I>
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </I>
);
export const IcoSearch = () => (
  <I>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </I>
);
export const IcoBell = () => (
  <I>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </I>
);
export const IcoMore = () => (
  <I>
    <circle cx="5.5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="18.5" cy="12" r="1" />
  </I>
);
export const IcoKeyboard = () => (
  <I>
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  </I>
);
export const IcoPlus = () => (
  <I>
    <path d="M12 5v14M5 12h14" />
  </I>
);
export const IcoMinus = () => (
  <I>
    <path d="M5 12h14" />
  </I>
);
export const IcoFit = () => (
  <I>
    <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
  </I>
);
export const IcoFocus = () => (
  <I>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
  </I>
);
export const IcoFollow = () => (
  <I>
    <rect x="7" y="9" width="10" height="7" rx="1.5" />
    <path d="M3 12.5h2M19 12.5h2M12 4v3" />
  </I>
);
export const IcoLayers = () => (
  <I>
    <path d="M12 4l9 4.5-9 4.5-9-4.5z" />
    <path d="M3 13l9 4.5 9-4.5" />
  </I>
);
export const IcoExpand = () => (
  <I>
    <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
  </I>
);
export const IcoChevronLeft = () => (
  <I>
    <path d="M15 5l-7 7 7 7" />
  </I>
);
export const IcoStep = () => (
  <I>
    <path d="M5 5v14l9-7zM18 5v14" />
  </I>
);
export const IcoHelp = () => (
  <I>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17h.01" />
  </I>
);
