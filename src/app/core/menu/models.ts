export interface MenuCategory {
  id: string;
  name: string;
  imageUrl: string | null;
  iconKey: string | null;
  sortOrder: number;
  itemCount: number;
}

export interface SaveMenuCategoryRequest {
  name: string;
  iconKey?: string | null;
  sortOrder: number;
}

export type ModifierSelectionType = 'Single' | 'Multiple';

export interface ModifierOption {
  id: string;
  name: string;
  /** Always the actual per-unit amount added to the item's price — computed server-side from the item's current price when priceIsTotalAmount is true, so checkout/pricing code never needs to care which mode this option was set up in. */
  priceDelta: number;
  /** Whether this option was configured as a total variant price (e.g. "Large = Rs 500") rather than an extra amount on top of the base price — only matters for redisplaying the editor form correctly; see totalPriceAmount. */
  priceIsTotalAmount: boolean;
  /** The raw total price entered when priceIsTotalAmount is true — null for a plain extra-amount option. */
  totalPriceAmount: number | null;
  sortOrder: number;
}

export interface ModifierOptionInput {
  name: string;
  /** The extra amount added to the item's price — used only when priceIsTotalAmount is false. */
  priceDelta: number;
  /** True to enter this option's TOTAL variant price instead of an extra amount — see totalPriceAmount. Required (non-null) when this is true. */
  priceIsTotalAmount: boolean;
  totalPriceAmount: number | null;
  sortOrder: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  selectionType: ModifierSelectionType;
  isRequired: boolean;
  sortOrder: number;
  options: ModifierOption[];
}

export interface ModifierGroupInput {
  name: string;
  selectionType: ModifierSelectionType;
  isRequired: boolean;
  sortOrder: number;
  options: ModifierOptionInput[];
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  isActive: boolean;
  imageUrl: string | null;
  iconKey: string | null;
  modifierGroups: ModifierGroup[];
}

export interface SaveMenuItemRequest {
  categoryId: string;
  name: string;
  price: number;
  isActive: boolean;
  iconKey?: string | null;
  modifierGroups: ModifierGroupInput[];
}
