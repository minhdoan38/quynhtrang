'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { calculatePrice, formatCurrencyVND, validateCommercialConfig, type CommercialConfigVersion } from '@/lib/domain/commercial-config.ts';

export function CommercialPreview({ config }: { config: CommercialConfigVersion }) {
  const [selectedId, setSelectedId] = useState(config.variantRules[0]?.variantId ?? '');
  const variantId = config.variantRules.some((rule) => rule.variantId === selectedId) ? selectedId : config.variantRules[0]?.variantId ?? '';
  const [quantity, setQuantity] = useState(config.variantRules[0]?.minimumQuantity ?? 1);
  let quote = null;
  try { if (!validateCommercialConfig(config, []).length) quote = calculatePrice(config, variantId, quantity); } catch { /* Show actionable copy, never domain exceptions. */ }
  return <section className="flex flex-col gap-4 rounded-lg border p-4" aria-label="Xem trước báo giá">
    <h3 className="font-semibold">Xem trước báo giá</h3>
    <p className="text-sm text-muted-foreground">Chỉ xem thử cấu hình đang mở; chưa tạo báo giá Checkout.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-2 text-sm">Variant<select className="min-h-11 rounded-lg border bg-background px-3" value={variantId} onChange={(event) => { setSelectedId(event.target.value); setQuantity(config.variantRules.find((rule) => rule.variantId === event.target.value)?.minimumQuantity ?? 1); }}>{config.variantRules.map((rule) => <option key={rule.variantId} value={rule.variantId}>{rule.variantId}</option>)}</select></label>
      <label className="flex flex-col gap-2 text-sm">Số lượng<Input className="min-h-11" type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
    </div>
    {quote ? <dl aria-live="polite" className="grid grid-cols-2 gap-3 text-sm tabular-nums sm:grid-cols-3">{[
      ['Bậc giá từ', String(quote.appliedTier.minimumQuantity)], ['Đơn giá', formatCurrencyVND(quote.unitPrice)], ['Tổng', formatCurrencyVND(quote.totalAmount)], ['Thanh toán ngay', formatCurrencyVND(quote.amountDueNow)], ['Còn lại', formatCurrencyVND(quote.remainingAmount)],
    ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl> : <p role="status" className="text-sm">Chưa thể tính giá. Kiểm tra bảng giá và chọn số lượng đúng tối thiểu, bước, tối đa.</p>}
  </section>;
}
