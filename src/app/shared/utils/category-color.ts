/**
 * Deterministic (never re-randomized) background color for a menu category
 * card that has neither an image nor an icon — see docs/modules/pos-menu.md.
 * Hash of the category's own Id picks a fixed palette index, so the same
 * category always looks the same across reloads.
 */
const PALETTE = [
  '#2563eb', // blue
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#db2777', // pink
  '#65a30d', // lime
  '#4f46e5', // indigo
  '#ea580c', // orange
];

export function categoryColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
