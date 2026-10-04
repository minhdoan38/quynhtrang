'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { AdminProduct } from '@/lib/repositories/admin-catalog-repository.ts';
import type { CommercialDraft } from '@/lib/domain/catalog.ts';
import type { ProductDefinitionCapabilities } from '@/lib/product-definition-registry.ts';
import { CATALOG_STATUS_LABEL, CATALOG_STATUS_BADGE, catalogStartingPrice, type CatalogActionResult } from '@/lib/admin/product-catalog-ui.ts';
import { formatCurrencyVND } from '@/lib/domain/commercial-config.ts';
import { activateProductAction, activateVariantAction, archiveProductAction, archiveVariantAction, enableVariantAction, updateProductMetadataAction } from '@/app/admin/products/actions.ts';
import { CommercialConfigEditor } from './commercial-config-editor';
import { ArchiveProductDialog } from './product-lifecycle-dialogs';

export function ProductDetail({ product, draft, availableDefinitions, canMutate }: { product: AdminProduct; draft: CommercialDraft | null; availableDefinitions: readonly ProductDefinitionCapabilities[]; canMutate: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(String(product.metadata?.description ?? ''));
  const [thumbnail, setThumbnail] = useState(String(product.metadata?.thumbnail ?? ''));
  const [sortOrder, setSortOrder] = useState(Number(product.metadata?.sortOrder ?? 0));
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  async function run(operation: () => Promise<CatalogActionResult<unknown>>, inDialog = false) {
    setPending(true);
    if (inDialog) setArchiveError(null);
    try {
      const result = await operation();
      if (!result.ok) {
        setNotice(result.message);
        if (inDialog) setArchiveError(result.message);
        return;
      }
      setNotice('Đã lưu thay đổi.'); setArchiveTarget(null); setArchiveError(null); router.refresh();
    } catch {
      const text = 'Chưa thể áp dụng giá mới.';
      setNotice(text);
      if (inDialog) setArchiveError(text);
    }
    finally { setPending(false); }
  }
  const productId = String(product.id);
  return <div className="flex flex-col gap-6" aria-busy={pending}>
    <header className="flex flex-col gap-3"><Link href="/admin/products" className="flex min-h-11 items-center text-sm underline underline-offset-4">Danh mục sản phẩm</Link><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">{product.name}</h1><Badge variant={CATALOG_STATUS_BADGE[product.status]}>{CATALOG_STATUS_LABEL[product.status]}</Badge></div>{!canMutate && <p className="text-sm text-muted-foreground">Chế độ chỉ xem. Chỉ quản trị viên được thay đổi danh mục và bảng giá.</p>}</header>
    <nav aria-label="Các phần sản phẩm" className="flex flex-wrap gap-3">{[['overview', 'Tổng quan'], ['variants', 'Variants'], ['pricing', 'Giá & số lượng'], ['payment', 'Thanh toán'], ['display', 'Hiển thị']].map(([id, label]) => <a key={id} className="flex min-h-11 items-center rounded-lg border px-3 text-sm focus-visible:outline-2" href={`#${id}`}>{label}</a>)}</nav>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); void run(() => updateProductMetadataAction({ productId, expectedRevision: product.revision, patch: { name, description, thumbnail: thumbnail || null, sortOrder } })); }}>
      <section id="overview" className="flex flex-col gap-4"><h2 className="text-lg font-semibold">Tổng quan</h2><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Họ sản phẩm (chỉ đọc)</dt><dd>{product.productType}</dd></div><div><dt className="text-muted-foreground">Definition keys (chỉ đọc)</dt><dd className="break-words">{product.variants.map((variant) => variant.definitionKey).filter(Boolean).join(', ') || 'Chưa cấu hình'}</dd></div></dl>
        <label className="flex flex-col gap-2 text-sm">Tên hiển thị<Input required maxLength={200} className="min-h-11" value={name} onChange={(event) => setName(event.target.value)} disabled={!canMutate || pending} /></label>
        <label className="flex flex-col gap-2 text-sm">Mô tả<Textarea maxLength={5000} className="min-h-24" value={description} onChange={(event) => setDescription(event.target.value)} disabled={!canMutate || pending} /></label>
      </section>
      <section id="display" className="flex flex-col gap-4"><h2 className="text-lg font-semibold">Hiển thị</h2><div className="grid gap-3 sm:grid-cols-2"><label className="flex flex-col gap-2 text-sm">Ảnh đại diện (HTTPS hoặc đường dẫn nội bộ)<Input className="min-h-11" value={thumbnail} onChange={(event) => setThumbnail(event.target.value)} disabled={!canMutate || pending} /></label><label className="flex flex-col gap-2 text-sm">Thứ tự hiển thị<Input className="min-h-11" type="number" step={1} value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} disabled={!canMutate || pending} /></label></div></section>
      {canMutate && <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={pending}>Lưu thông tin</Button>{product.status !== 'active' && <Button variant="outline" className="min-h-11" disabled={pending} onClick={() => run(() => activateProductAction({ productId, expectedRevision: product.revision }))}>Đưa vào bán</Button>}{product.status !== 'archived' && <Button variant="outline" className="min-h-11" disabled={pending} onClick={() => setArchiveTarget(productId)}>Lưu trữ sản phẩm</Button>}</div>}
    </form>
    <section id="variants" className="flex flex-col gap-4"><h2 className="text-lg font-semibold">Variants</h2>{product.variants.length === 0 && <p className="text-sm text-muted-foreground">Chưa có variant được cấu hình.</p>}{product.variants.map((variant) => {
      const price = catalogStartingPrice(product, variant.id);
      return <article key={variant.id} className="flex flex-col gap-3 border-b pb-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-medium">{variant.name}</h3><p className="break-words text-sm text-muted-foreground">{variant.definitionKey ?? 'Chưa gắn definition key'}</p><p className="text-sm">{variant.definition?.physicalSummary ?? 'Chưa có thông tin vật lý'} · {variant.definition?.surfacesSummary}</p><p className="text-sm">Giá từ: {price === null ? 'Chưa xuất bản giá' : formatCurrencyVND(price)}</p></div><Badge variant={CATALOG_STATUS_BADGE[variant.status]}>{CATALOG_STATUS_LABEL[variant.status]}</Badge></div>{canMutate && <div className="flex flex-wrap gap-2">{variant.status !== 'active' && <Button variant="outline" className="min-h-11" disabled={pending} onClick={() => run(() => activateVariantAction({ productId, variantId: variant.id, expectedRevision: variant.revision }))}>Đưa variant vào bán</Button>}{variant.status !== 'archived' && <Button variant="outline" className="min-h-11" disabled={pending} onClick={() => setArchiveTarget(variant.id)}>Lưu trữ variant</Button>}</div>}</article>;
    })}{canMutate && <fieldset disabled={pending} className="flex flex-col gap-2"><legend className="mb-2 font-medium">Bật variant</legend><p className="text-sm text-muted-foreground">Chỉ định nghĩa được hỗ trợ và chưa cấu hình. Variant mới bắt đầu ở bản nháp.</p>{availableDefinitions.length === 0 ? <p className="text-sm">Đã cấu hình tất cả định nghĩa được hỗ trợ.</p> : availableDefinitions.map((definition) => <Button key={definition.definitionKey} variant="outline" className="min-h-11 self-start" onClick={() => run(() => enableVariantAction({ productId, definitionKey: definition.definitionKey, expectedProductRevision: product.revision }))}>{definition.physicalSummary} ({definition.definitionKey})</Button>)}</fieldset>}</section>
    <CommercialConfigEditor product={product} initialDraft={draft} editable={canMutate} onPublished={() => router.refresh()} />
    <ArchiveProductDialog open={archiveTarget !== null} onOpenChange={(open) => { if (!open) { setArchiveTarget(null); setArchiveError(null); } }} pending={pending} error={archiveError} onConfirm={() => {
      if (archiveTarget === productId) void run(() => archiveProductAction({ productId, expectedRevision: product.revision }), true);
      else { const variant = product.variants.find((item) => item.id === archiveTarget); if (variant) void run(() => archiveVariantAction({ productId, variantId: variant.id, expectedRevision: variant.revision }), true); }
    }} />
  </div>;
}
