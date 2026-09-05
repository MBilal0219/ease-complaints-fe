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

/** What the Terminal's own receipt prints as — see docs/modules/pos-kot-and-printing.md. A4 is deliberately not an option here (see ReportingPageSize) — a sale receipt is a small-format document. */
export type ReceiptPaperSize = 'Thermal80mm' | 'A5';

/** What a future reporting/export feature will print to — not consumed by anything yet; the setting exists ahead of that feature the same way ReceiptPaperSize existed ahead of the Terminal's own print-format picker. */
export type ReportingPageSize = 'A4' | 'A5';

export interface PosSettings {
  logoUrl: string | null;
  receiptFooterText: string | null;
  currencySymbol: string;
  receiptPaperSize: ReceiptPaperSize;
  reportingPageSize: ReportingPageSize;
}

export interface SavePosSettingsRequest {
  receiptFooterText: string | null;
  currencySymbol: string;
  receiptPaperSize: ReceiptPaperSize;
  reportingPageSize: ReportingPageSize;
}
