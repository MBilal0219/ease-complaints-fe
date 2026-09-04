export interface PaymentMethod {
  id: string;
  name: string;
  taxRatePercent: number;
  isActive: boolean;
  sortOrder: number;
}

export interface SavePaymentMethodRequest {
  name: string;
  taxRatePercent: number;
  sortOrder: number;
}

export interface PosSettings {
  logoUrl: string | null;
  receiptFooterText: string | null;
  currencySymbol: string;
}

export interface SavePosSettingsRequest {
  receiptFooterText: string | null;
  currencySymbol: string;
}
