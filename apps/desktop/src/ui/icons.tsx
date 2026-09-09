/** Line icons, 20×20 grid, stroked with `currentColor` so themes recolour them. */

const base = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function BookmarkIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} aria-hidden>
      <path d="M5 3h10v14l-5-3.5L5 17z" />
    </svg>
  );
}

export function WorkspaceIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} aria-hidden>
      <rect x="3.5" y="4.5" width="13" height="11" rx="2.5" />
      <path d="M7 9h6M7 12h3" />
    </svg>
  );
}

export function CurrentWorkspaceIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} aria-hidden>
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="2" fill="currentColor" />
    </svg>
  );
}

export function RevsetIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} aria-hidden>
      <path d="M4 6h12M4 10h12M4 14h8" />
    </svg>
  );
}

export function RepoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={1.5} aria-hidden>
      <rect x="2.5" y="4" width="15" height="12" rx="2.5" />
      <path d="M7.5 4v12" />
    </svg>
  );
}

export function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={1.8} aria-hidden>
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13.5 13.5l3.5 3.5" />
    </svg>
  );
}

export function FetchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} aria-hidden>
      <path d="M10 3v10M6 9l4 4 4-4M4 16h12" />
    </svg>
  );
}

export function PushIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} aria-hidden>
      <path d="M10 17V7M6 11l4-4 4 4M4 4h12" />
    </svg>
  );
}

export function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={1.8} aria-hidden>
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}
