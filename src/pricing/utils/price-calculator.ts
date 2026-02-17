export interface LinePriceInput {
  quantity: number;
  unitPrice: number;
  discountPercent?: number | null;
  discountAmount?: number | null;
  taxPercent?: number | null;
  taxAmount?: number | null;
}

export interface LinePriceResult {
  net: number;
  discountAmount: number;
  discountPercent?: number | null;
  taxAmount: number;
  taxPercent?: number | null;
  lineTotal: number;
}

export function calculateLineAmounts(input: LinePriceInput): LinePriceResult {
  const qty = input.quantity ?? 0;
  const unit = input.unitPrice ?? 0;

  const net = qty * unit;

  let discountAmount = 0;
  let discountPercent = input.discountPercent ?? null;
  if (input.discountAmount != null) {
    discountAmount = input.discountAmount;
  } else if (discountPercent != null) {
    discountAmount = (net * discountPercent) / 100;
  }

  let taxAmount = 0;
  let taxPercent = input.taxPercent ?? null;
  const taxableBase = net - discountAmount;
  if (input.taxAmount != null) {
    taxAmount = input.taxAmount;
  } else if (taxPercent != null) {
    taxAmount = (taxableBase * taxPercent) / 100;
  }

  const lineTotal = taxableBase + taxAmount;

  return {
    net,
    discountAmount,
    discountPercent,
    taxAmount,
    taxPercent,
    lineTotal,
  };
}
