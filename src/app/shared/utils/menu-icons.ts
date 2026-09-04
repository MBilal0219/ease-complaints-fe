/** Fixed set of icon choices for a menu category card that has no image — see docs/modules/pos-menu.md ("images/icons/random colors"). Keys are what's stored on MenuCategory.iconKey; never renumbered/removed, only appended to, so existing categories don't silently change icon. */
export const MENU_ICONS: { key: string; emoji: string; label: string }[] = [
  { key: 'burger', emoji: '🍔', label: 'Burger' },
  { key: 'pizza', emoji: '🍕', label: 'Pizza' },
  { key: 'drink', emoji: '🥤', label: 'Drink' },
  { key: 'coffee', emoji: '☕', label: 'Coffee' },
  { key: 'dessert', emoji: '🍰', label: 'Dessert' },
  { key: 'salad', emoji: '🥗', label: 'Salad' },
  { key: 'soup', emoji: '🍲', label: 'Soup' },
  { key: 'grill', emoji: '🍖', label: 'Grill' },
  { key: 'seafood', emoji: '🍤', label: 'Seafood' },
  { key: 'noodles', emoji: '🍜', label: 'Noodles' },
  { key: 'rice', emoji: '🍛', label: 'Rice' },
  { key: 'breakfast', emoji: '🍳', label: 'Breakfast' },
];

export function emojiForIconKey(iconKey: string | null): string | null {
  return MENU_ICONS.find((i) => i.key === iconKey)?.emoji ?? null;
}
