export type SaleOrderType = 'DineIn' | 'Takeaway' | 'Delivery';
export type SaleStatus = 'Held' | 'Punched' | 'Voided';

export interface SelectedModifier {
  optionId: string;
  groupName: string;
  optionName: string;
  priceDelta: number;
}

export interface SaleItem {
  id: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPriceAtSale: number;
  lineDiscountAmount: number;
  lineTotal: number;
  selectedModifiers: SelectedModifier[];
}

export interface Sale {
  id: string;
  invoiceNumber: number | null;
  /** "{branch prefix}-{invoiceNumber, zero-padded}", e.g. "DOW-000004" — the persisted, authoritative receipt identity (Sale.ReceiptNumber). Assigned the moment the sale is first created (Held), not just once punched — see Held Orders — so it's already set on a Held sale too; null only for one that predates that change. Prefer this over invoiceNumber/branch for display. */
  receiptNumber: string | null;
  /** The owning restaurant's owner's Branch (set at Admin party-creation time) — null if never set. Kept mostly for reference; receiptNumber already has it baked in. */
  branch: string | null;
  orderType: SaleOrderType;
  tableId: string | null;
  tableName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  status: SaleStatus;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  createdAtUtc: string;
  punchedAtUtc: string | null;
  voidedAtUtc: string | null;
  voidReason: string | null;
  originalSaleId: string | null;
  items: SaleItem[];
}

export interface SaleSearchFilter {
  status?: SaleStatus | '';
  orderType?: SaleOrderType | '';
  dateFromUtc?: string;
  dateToUtc?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface SaveSaleItemRequest {
  menuItemId: string;
  quantity: number;
  selectedOptionIds: string[];
  lineDiscountAmount: number;
}

export interface SaveSaleRequest {
  orderType: SaleOrderType;
  tableId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  discountAmount: number;
  items: SaveSaleItemRequest[];
}
