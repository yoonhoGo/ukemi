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

export function TagIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} aria-hidden>
      <path d="M3.5 10.5V4h6.5l6.5 6.5-6.5 6.5z" />
      <circle cx="7" cy="7.5" r="1" fill="currentColor" />
    </svg>
  );
}

/** A sidebar section's fold. Points down; the stylesheet turns it when closed. */
export function ChevronIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={1.8} aria-hidden>
      <path d="M5.5 7.5l4.5 4.5 4.5-4.5" />
    </svg>
  );
}

/** Work in progress: the changes being written. */
export function PencilIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} aria-hidden>
      <path d="M13.5 3.5l3 3L7 16H4v-3z" />
      <path d="M11.5 5.5l3 3" />
    </svg>
  );
}

/** A workspace is a folder on disk, so the section wears one. */
export function FolderIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} aria-hidden>
      <path d="M3 6.5V15a1.5 1.5 0 001.5 1.5h11A1.5 1.5 0 0017 15V8a1.5 1.5 0 00-1.5-1.5H10L8.5 4.5H4.5A1.5 1.5 0 003 6z" />
    </svg>
  );
}

/** The repository as a whole: the picture every Git client draws for it. */
export function BranchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} aria-hidden>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="15" r="2" />
      <circle cx="14" cy="7" r="2" />
      <path d="M6 7v6M14 9c0 3-8 2-8 4" />
    </svg>
  );
}

/** The user's own picks — the glyph Finder gives "Favorites". */
export function StarIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} aria-hidden>
      <path d="M10 3l2.1 4.4 4.8.6-3.5 3.3.9 4.8L10 13.8l-4.3 2.3.9-4.8L3.1 8l4.8-.6z" />
    </svg>
  );
}

export function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} aria-hidden>
      <circle cx="9" cy="9" r="5" />
      <path d="M13 13l3.5 3.5" />
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

/**
 * The revset field's glyph. A funnel, not a magnifier: the field decides which
 * revisions the graph shows and never searches their text, and the magnifier
 * that used to sit there had people reading it as a commit search.
 */
export function FilterIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} aria-hidden>
      <path d="M3 4.5h14l-5.5 6v5l-3 1.5v-6.5z" />
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

/** The settings gear. Six teeth is the fewest that still reads as a cog. */
export function SettingsIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} aria-hidden>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 3v1.8M10 15.2V17M4.05 6.5l1.56.9M14.39 12.6l1.56.9M4.05 13.5l1.56-.9M14.39 7.4l1.56-.9" />
    </svg>
  );
}
