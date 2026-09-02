export interface NavItem {
  label: string;
  route: string;
  /** Heroicons-style SVG path data (24x24 viewBox), kept inline to avoid an icon library dependency. */
  iconPath: string;
}
