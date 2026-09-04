export interface NavItem {
  label: string;
  /** Omit for a group header (has `children` instead) — it only expands/collapses, it doesn't navigate anywhere itself. */
  route?: string;
  /** Heroicons-style SVG path data (24x24 viewBox), kept inline to avoid an icon library dependency. */
  iconPath: string;
  /** Present on a group header (e.g. "Complaints", "POS") — rendered as a collapsible section, auto-expanded when the active route is one of these. */
  children?: NavItem[];
}
