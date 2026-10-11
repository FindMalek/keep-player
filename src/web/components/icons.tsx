import type { ReactNode } from "react";

function Icon({ children, size = 16, filled = false }: { children: ReactNode; size?: number; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Play = ({ size }: { size?: number }) => (
  <Icon size={size} filled>
    <path d="M4.5 2.5v11l9-5.5z" />
  </Icon>
);
export const Pause = ({ size }: { size?: number }) => (
  <Icon size={size} filled>
    <rect x="3.5" y="2.5" width="3" height="11" />
    <rect x="9.5" y="2.5" width="3" height="11" />
  </Icon>
);
export const Next = () => (
  <Icon>
    <path d="M3 3v10l7-5z" fill="currentColor" />
    <path d="M12.5 3v10" />
  </Icon>
);
export const Previous = () => (
  <Icon>
    <path d="M13 3v10L6 8z" fill="currentColor" />
    <path d="M3.5 3v10" />
  </Icon>
);
export const Shuffle = () => (
  <Icon>
    <path d="M1.5 4.5h3l6 7h4M1.5 11.5h3l1.5-1.75M10.5 4.5h4M12.5 2.5l2 2-2 2M12.5 9.5l2 2-2 2M8 6.25l1.5-1.75" />
  </Icon>
);
export const Repeat = ({ one }: { one?: boolean }) => (
  <Icon>
    <path d="M2.5 7.5v-3h10M10.5 2.5l2 2-2 2M13.5 8.5v3h-10M5.5 13.5l-2-2 2-2" />
    {one && <path d="M8 6.5v3" />}
  </Icon>
);
export const Volume = ({ muted }: { muted?: boolean }) => (
  <Icon>
    <path d="M2.5 6v4h2.5l3.5 3V3L5 6z" />
    {muted ? <path d="M10.5 6l4 4M14.5 6l-4 4" /> : <path d="M11 5.5c1 1.5 1 3.5 0 5M13 3.5c2 2.5 2 6.5 0 9" />}
  </Icon>
);
export const Queue = () => (
  <Icon>
    <path d="M2 3.5h12M2 7h12M2 10.5h7M11.5 9.5v4l3-2z" />
  </Icon>
);
export const Lyrics = () => (
  <Icon>
    <path d="M2.5 2.5h11v8h-6l-3 3v-3h-2z" />
    <path d="M5 5.5h6M5 7.5h4" />
  </Icon>
);
export const Search = () => (
  <Icon>
    <rect x="2" y="2" width="8" height="8" />
    <path d="M10 10l4 4" />
  </Icon>
);
export const Plus = () => (
  <Icon>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);
export const Close = () => (
  <Icon>
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
  </Icon>
);
export const Folder = () => (
  <Icon>
    <path d="M1.5 3.5h5l1.5 1.5h6.5v8h-13z" />
  </Icon>
);
export const Disc = () => (
  <Icon>
    <rect x="2" y="2" width="12" height="12" />
    <rect x="6.5" y="6.5" width="3" height="3" />
  </Icon>
);
