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
  priceDelta: number;
  sortOrder: number;
}

export interface ModifierOptionInput {
  name: string;
  priceDelta: number;
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
