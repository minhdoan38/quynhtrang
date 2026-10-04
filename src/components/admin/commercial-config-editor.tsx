'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CommercialPreview } from './commercial-preview';
import { PublishProductDialog } from './product-lifecycle-dialogs';
import type { CommercialDraft } from '@/lib/domain/catalog.ts';
import { validateCommercialConfig, type CommercialConfigVersion, type CommercialVariantRule } from '@/lib/domain/commercial-config.ts';
import type { AdminProduct } from '@/lib/repositories/admin-catalog-repository.ts';
import { commercialDraftConfig } from '@/lib/admin/product-catalog-ui.ts';
import { loadCommercialDraftAction, saveCommercialDraftAction, publishCommercialConfigAction } from '@/app/admin/products/actions.ts';

export function CommercialConfigEditor({ product, initialDraft, editable, onPublished }: { product: AdminProduct; initialDraft: CommercialDraft | null; editable: boolean; onPublished: () => void }) {
  const [draft, setDraft] = useState(initialDraft);
  const [config, setConfig] = useState<CommercialConfigVersion | null>(initialDraft ? commercialDraftConfig(initialDraft) : product.currentConfig ?? null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const activeIds = product.variants.filter((variant) => variant.status === 'active').map((variant) => variant.id);
  const invalid = config ? validateCommercialConfig(config, activeIds).length > 0 : true;
  const locked = !editable || !draft || pending;
  function change(next: CommercialConfigVersion) { setConfig(next); setDirty(true); setMessage(''); }
  function updateRule(index: number, rule: CommercialVariantRule) {
    if (config) change({ ...config, variantRules: config.variantRules.map((current, i) => i === index ? rule : current) });
  }
  async function openDraft() {
    setPending(true);
    try {
      const result = await loadCommercialDraftAction(String(product.id));
      if (!result.ok) { setMessage(result.message); return; }
      setDraft(result.value); setConfig(commercialDraftConfig(result.value)); setDirty(false); setMessage('Đã mở bản nháp. Giá đang bán chưa thay đổi.');
    } catch { setMessage('Chưa thể tải cấu hình sản phẩm.'); }
    finally { setPending(false); }
  }
  async function save() {
    if (!draft || !config) return;
    setPending(true);
    try {
      const result = await saveCommercialDraftAction({ productId: String(product.id), draftId: draft.id, expectedRevision: draft.revision, payload: config, requestId: crypto.randomUUID() });
      if (!result.ok) { setMessage(result.message); return; }
      setDraft(result.value); setConfig(commercialDraftConfig(result.value)); setDirty(false); setMessage('Đã lưu bản nháp. Giá đang bán chưa thay đổi.');
    } catch { setMessage('Chưa thể áp dụng giá mới.'); }
    finally { setPending(false); }
  }
  async function publish() {
    if (!draft || dirty) return;
    setPending(true);
    try {
      const result = await publishCommercialConfigAction({ productId: String(product.id), draftId: draft.id, expectedDraftRevision: draft.revision, expectedProductRevision: product.revision, requestId: crypto.randomUUID() });
      if (!result.ok) { setMessage(result.message); return; }
      setDraft(null); setConfig(result.value); setPublishOpen(false); setMessage('Đã xuất bản cấu hình. Orders hiện có không thay đổi.'); onPublished();
    } catch { setMessage('Chưa thể áp dụng giá mới.'); }
    finally { setPending(false); }
  }
  return <div className="flex flex-col gap-6" aria-busy={pending}>
    <div className="flex flex-wrap items-center gap-3">
      <Badge variant={draft ? 'honey' : 'sage'}>{draft ? dirty ? 'Bản nháp · chưa lưu' : `Bản nháp đã lưu · revision ${draft.revision}` : config ? `Đã xuất bản · phiên bản ${config.versionNumber}` : 'Chưa xuất bản'}</Badge>
      {editable && !draft && <Button className="min-h-11" disabled={pending} onClick={openDraft}>Mở bản nháp giá</Button>}
    </div>
    {message && <p role="status" className="text-sm">{message}</p>}
    {config ? <>
      <section id="pricing" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Giá & số lượng</h2>
        {config.variantRules.length === 0 && <p className="text-sm text-muted-foreground">Chọn variant để thêm quy tắc số lượng và bảng giá.</p>}
        {config.variantRules.map((rule, index) => <fieldset key={rule.variantId} disabled={locked} className="flex min-w-0 flex-col gap-3 rounded-lg border p-4">
          <legend className="px-1 font-medium">{product.variants.find((variant) => variant.id === rule.variantId)?.name ?? rule.variantId}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-2 text-sm">Số lượng tối thiểu<Input className="min-h-11" type="number" min={1} step={1} value={rule.minimumQuantity} onChange={(event) => updateRule(index, { ...rule, minimumQuantity: Number(event.target.value) })} /></label>
            <label className="flex flex-col gap-2 text-sm">Bước số lượng<Input className="min-h-11" type="number" min={1} step={1} value={rule.quantityStep} onChange={(event) => updateRule(index, { ...rule, quantityStep: Number(event.target.value) })} /></label>
            <label className="flex flex-col gap-2 text-sm">Tối đa (trống: không giới hạn)<Input className="min-h-11" type="number" min={rule.minimumQuantity} step={1} value={rule.maximumQuantity ?? ''} onChange={(event) => updateRule(index, { ...rule, maximumQuantity: event.target.value === '' ? null : Number(event.target.value) })} /></label>
          </div>
          <p className="text-sm text-muted-foreground">Ngưỡng tăng dần; bậc đầu bằng số lượng tối thiểu. Mỗi ngưỡng phải đúng bước số lượng.</p>
          {rule.tiers.map((tier, tierIndex) => <div key={tierIndex} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="flex flex-col gap-2 text-sm">Ngưỡng bậc {tierIndex + 1}<Input className="min-h-11" type="number" min={1} step={1} value={tier.minimumQuantity} onChange={(event) => updateRule(index, { ...rule, tiers: rule.tiers.map((current, i) => i === tierIndex ? { ...current, minimumQuantity: Number(event.target.value) } : current) })} /></label>
            <label className="flex flex-col gap-2 text-sm">Đơn giá (VND)<Input className="min-h-11" type="number" min={1} step={1} value={tier.unitPrice} onChange={(event) => updateRule(index, { ...rule, tiers: rule.tiers.map((current, i) => i === tierIndex ? { ...current, unitPrice: Number(event.target.value) } : current) })} /></label>
            <Button variant="outline" className="min-h-11" disabled={rule.tiers.length === 1} onClick={() => updateRule(index, { ...rule, tiers: rule.tiers.filter((_, i) => i !== tierIndex) })} aria-label={`Xóa bậc ${tierIndex + 1} của ${rule.variantId}`}>Xóa bậc</Button>
          </div>)}
          {editable && <div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={() => updateRule(index, { ...rule, tiers: [...rule.tiers, { minimumQuantity: (rule.tiers.at(-1)?.minimumQuantity ?? rule.minimumQuantity) + rule.quantityStep, unitPrice: rule.tiers.at(-1)?.unitPrice ?? 1 }] })}>Thêm bậc giá</Button><Button variant="outline" className="min-h-11" onClick={() => change({ ...config, variantRules: config.variantRules.filter((_, i) => i !== index) })}>Xóa quy tắc variant</Button></div>}
        </fieldset>)}
        {!locked && product.variants.filter((variant) => !config.variantRules.some((rule) => rule.variantId === variant.id)).map((variant) => <Button key={variant.id} variant="outline" className="min-h-11 self-start" onClick={() => change({ ...config, variantRules: [...config.variantRules, { variantId: variant.id, minimumQuantity: 1, quantityStep: 1, maximumQuantity: null, tiers: [{ minimumQuantity: 1, unitPrice: 1 }] }] })}>Thêm giá cho {variant.name}</Button>)}
      </section>
      <section id="payment" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Thanh toán</h2>
        <fieldset disabled={locked} className="flex flex-wrap gap-4"><legend className="sr-only">Chính sách thanh toán</legend>
          <label className="flex min-h-11 items-center gap-2"><input type="radio" name={`payment-${product.id}`} checked={config.paymentPolicy.kind === 'full_payment'} onChange={() => change({ ...config, paymentPolicy: { kind: 'full_payment' } })} />Thanh toán toàn bộ</label>
          <label className="flex min-h-11 items-center gap-2"><input type="radio" name={`payment-${product.id}`} checked={config.paymentPolicy.kind === 'fixed_deposit'} onChange={() => change({ ...config, paymentPolicy: { kind: 'fixed_deposit', depositAmount: 0 } })} />Đặt cọc cố định</label>
        </fieldset>
        {config.paymentPolicy.kind === 'fixed_deposit' && <label className="flex max-w-sm flex-col gap-2 text-sm">Tiền cọc (VND)<Input className="min-h-11" type="number" min={0} step={1} disabled={locked} value={config.paymentPolicy.depositAmount} onChange={(event) => change({ ...config, paymentPolicy: { kind: 'fixed_deposit', depositAmount: Number(event.target.value) } })} /></label>}
      </section>
      {invalid && <p role="alert" className="text-sm text-destructive">Bảng giá chưa hợp lệ. Kiểm tra ngưỡng, bước, đơn giá và mức cọc cho tất cả variant đang bán.</p>}
      <CommercialPreview config={config} />
      {editable && draft && <div className="flex flex-wrap gap-2"><Button className="min-h-11" disabled={pending || invalid || !dirty} onClick={save}>{pending ? 'Đang xử lý…' : 'Lưu bản nháp'}</Button><Button variant="outline" className="min-h-11" disabled={pending || invalid || dirty} onClick={() => setPublishOpen(true)}>Xuất bản giá</Button></div>}
    </> : <p className="text-sm text-muted-foreground">Chưa có cấu hình giá hoặc thanh toán đã xuất bản.</p>}
    <PublishProductDialog open={publishOpen} onOpenChange={setPublishOpen} onConfirm={publish} pending={pending} />
  </div>;
}
