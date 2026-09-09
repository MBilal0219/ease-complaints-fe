export interface TableSection {
  id: string;
  name: string;
  sortOrder: number;
  tableCount: number;
}

export interface SaveTableSectionRequest {
  name: string;
  sortOrder: number;
}

export type TableStatus = 'Free' | 'Occupied';

export interface RestaurantTable {
  id: string;
  sectionId: string | null;
  sectionName: string | null;
  name: string;
  seats: number;
  status: TableStatus;
}

export interface SaveTableRequest {
  sectionId?: string | null;
  name: string;
  seats: number;
}
