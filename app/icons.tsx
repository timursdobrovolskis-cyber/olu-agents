import type { IconName } from "@/lib/intake";

/**
 * Drafting-manual pictograms: straight lines, butt caps, no curves where a
 * chamfer will do. They inherit currentColor so option rows can invert.
 */
const PATHS: Record<IconName, React.ReactNode> = {
  // Hanger
  fashion: (
    <>
      <path d="M12 4v3" />
      <path d="M12 7 3 15v3h18v-3L12 7Z" />
    </>
  ),
  // Chip
  electronics: (
    <>
      <rect x="7" y="7" width="10" height="10" />
      <path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3" />
    </>
  ),
  // Bottle
  beauty: (
    <>
      <path d="M10 3h4v4h-4z" />
      <path d="M9 7h6l1 4v10H8V11l1-4Z" />
      <path d="M8 15h8" />
    </>
  ),
  // Pitched roof
  home: (
    <>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 11v10h14V11" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  // Cup
  food: (
    <>
      <path d="M5 7h12v10l-2 4H7l-2-4V7Z" />
      <path d="M17 9h3v4h-3" />
      <path d="M8 3v2M12 3v2" />
    </>
  ),
  // Display + cursor
  digital: (
    <>
      <rect x="3" y="4" width="18" height="13" />
      <path d="M11 11l5 3-2 1 2 3-2 1-2-3-1 2V11Z" />
      <path d="M8 21h8" />
    </>
  ),
  // Funnel
  leads: (
    <>
      <path d="M3 4h18l-7 8v9l-4-3v-6L3 4Z" />
    </>
  ),
  // A cart, and the customer leaving it
  abandonment: (
    <>
      <path d="M2 4h2.5l2.5 9h8.5" />
      <path d="M6 7h9l-1 4H7" />
      <rect x="7" y="15.5" width="2.5" height="2.5" />
      <rect x="13" y="15.5" width="2.5" height="2.5" />
      <path d="M17 9l5-5" />
      <path d="M18 4h4v4" />
    </>
  ),
  // A schedule with most of its slots empty
  gigs: (
    <>
      <rect x="3" y="5" width="18" height="16" />
      <path d="M3 10h18" />
      <path d="M8 2v4M16 2v4" />
      <rect x="6" y="13" width="3" height="3" />
      <rect x="15" y="13" width="3" height="3" />
    </>
  ),
  // Two frames, talking
  comms: (
    <>
      <path d="M3 5h12v8H7l-4 3V5Z" />
      <path d="M9 13v-1h12v8l-4-3h-5" />
    </>
  ),
  // Trend with arrowhead
  forecast: (
    <>
      <path d="M3 20h18" />
      <path d="M3 20V4" />
      <path d="M6 16l4-5 3 3 5-7" />
      <path d="M14 7h4v4" />
    </>
  ),
  // Bars under a rule
  analytics: (
    <>
      <path d="M3 20h18" />
      <path d="M3 20V4" />
      <rect x="6" y="12" width="3" height="8" />
      <rect x="11" y="8" width="3" height="12" />
      <rect x="16" y="15" width="3" height="5" />
    </>
  ),
  // Carton
  box: (
    <>
      <path d="M12 3 3 7v10l9 4 9-4V7l-9-4Z" />
      <path d="M3 7l9 4 9-4" />
      <path d="M12 11v10" />
    </>
  ),
  // Cycle
  repeat: (
    <>
      <path d="M4 12a8 8 0 0 1 8-8h5" />
      <path d="M14 1l3 3-3 3" />
      <path d="M20 12a8 8 0 0 1-8 8H7" />
      <path d="M10 23l-3-3 3-3" />
    </>
  ),
  // Compass / set square
  bespoke: (
    <>
      <path d="M12 3v4" />
      <path d="M12 7 6 21" />
      <path d="M12 7l6 14" />
      <path d="M9 15h6" />
    </>
  ),
  // Facet
  premium: (
    <>
      <path d="M6 3h12l3 6-9 12L3 9l3-6Z" />
      <path d="M3 9h18" />
      <path d="M9 3l-2 6 5 12 5-12-2-6" />
    </>
  ),
  // Registration cross
  other: (
    <>
      <path d="M12 4v16M4 12h16" />
      <circle cx="12" cy="12" r="7" />
    </>
  ),
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="butt"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
