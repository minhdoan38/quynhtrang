'use client';

import { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import type { CatalogProduct } from '@/lib/product-catalog';
import type { TemplateCard, TemplateVersionPayload } from '@/lib/domain/template';
import { DesignCanvas } from '@/components/customizer/design-canvas';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { AspectRatio } from '@/components/ui/aspect-ratio';

interface ResponsiveTemplatePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateItem: TemplateCard | null;
  product: CatalogProduct;
  selectedVariantId: string;
  onApply: (templateId: string) => void;
}

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isDesktop;
}

export function ResponsiveTemplatePreview({
  open,
  onOpenChange,
  templateItem,
  product,
  selectedVariantId,
  onApply,
}: ResponsiveTemplatePreviewProps) {
  const isDesktop = useIsDesktop();
  const [previewTab, setPreviewTab] = useState<string>('default');
  const [versionPayload, setVersionPayload] = useState<TemplateVersionPayload | null>(null);
  const [isLoadingVersion, setIsLoadingVersion] = useState<boolean>(false);

  // Reset preview tab when item changes
  useEffect(() => {
    setPreviewTab('default');
  }, [templateItem?.id]);

  // Lazy-load version on preview open
  useEffect(() => {
    if (!open || !templateItem?.currentVersionId) {
      setVersionPayload(null);
      return;
    }

    let isMounted = true;
    setIsLoadingVersion(true);

    fetch(`/api/templates/versions/${templateItem.currentVersionId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Không thể tải phiên bản');
        return res.json() as Promise<TemplateVersionPayload>;
      })
      .then((data) => {
        if (isMounted) {
          setVersionPayload(data);
          setIsLoadingVersion(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoadingVersion(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [open, templateItem?.currentVersionId]);

  if (!templateItem) return null;
  const { id } = templateItem;

  const currentVariant =
    selectedVariantId !== 'all'
      ? product.variants.find((v) => v.id === selectedVariantId) ?? product.variants[0]
      : product.variants[0];

  // Aspect ratio for thumbnail
  let ratio = 1;
  if (product.id === 'card') {
    ratio = currentVariant.id === 'vertical' ? 3 / 4 : 4 / 3;
  } else if (product.id === 'notebook') {
    ratio = 3 / 4;
  } else if (product.id === 'wrapping') {
    ratio = 4 / 5;
  }

  const baseOptions = {
    ...((versionPayload?.document?.productOptions as Record<string, unknown>) || {}),
  };

  const previewOptions: Record<string, unknown> = {
    ...baseOptions,
    ...(product.id === 'card' && previewTab === 'inside' ? { surface: 'inside' } : {}),
    ...(product.id === 'card' && previewTab === 'back' ? { surface: 'inside' } : {}),
  };

  const renderProductTabs = () => {
    if (product.id === 'card') {
      return (
        <div className="flex items-center justify-center gap-1.5 rounded-full bg-[#F8F1E5] p-1 text-xs">
          <button
            type="button"
            onClick={() => setPreviewTab('default')}
            className={`rounded-full px-3 py-1 font-medium transition-all ${previewTab === 'default'
                ? 'bg-[#315F86] text-white shadow-2xs'
                : 'text-[#71706F] hover:text-[#343338]'
              }`}
          >
            Mặt trước
          </button>
          <button
            type="button"
            onClick={() => setPreviewTab('inside')}
            className={`rounded-full px-3 py-1 font-medium transition-all ${previewTab === 'inside'
                ? 'bg-[#315F86] text-white shadow-2xs'
                : 'text-[#71706F] hover:text-[#343338]'
              }`}
          >
            Bên trong
          </button>
          <button
            type="button"
            onClick={() => setPreviewTab('back')}
            className={`rounded-full px-3 py-1 font-medium transition-all ${previewTab === 'back'
                ? 'bg-[#315F86] text-white shadow-2xs'
                : 'text-[#71706F] hover:text-[#343338]'
              }`}
          >
            Mặt sau
          </button>
        </div>
      );
    }

    if (product.id === 'sticker') {
      return (
        <div className="flex items-center justify-center gap-1.5 rounded-full bg-[#F8F1E5] p-1 text-xs">
          <button
            type="button"
            onClick={() => setPreviewTab('default')}
            className={`rounded-full px-3 py-1 font-medium transition-all ${previewTab === 'default'
                ? 'bg-[#315F86] text-white shadow-2xs'
                : 'text-[#71706F] hover:text-[#343338]'
              }`}
          >
            Thiết kế
          </button>
          <button
            type="button"
            onClick={() => setPreviewTab('cutout')}
            className={`rounded-full px-3 py-1 font-medium transition-all ${previewTab === 'cutout'
                ? 'bg-[#315F86] text-white shadow-2xs'
                : 'text-[#71706F] hover:text-[#343338]'
              }`}
          >
            Sau khi cắt
          </button>
        </div>
      );
    }

    if (product.id === 'wrapping') {
      return (
        <div className="flex items-center justify-center gap-1.5 rounded-full bg-[#F8F1E5] p-1 text-xs">
          <button
            type="button"
            onClick={() => setPreviewTab('default')}
            className={`rounded-full px-3 py-1 font-medium transition-all ${previewTab === 'default'
                ? 'bg-[#315F86] text-white shadow-2xs'
                : 'text-[#71706F] hover:text-[#343338]'
              }`}
          >
            Thiết kế
          </button>
          <button
            type="button"
            onClick={() => setPreviewTab('box')}
            className={`rounded-full px-3 py-1 font-medium transition-all ${previewTab === 'box'
                ? 'bg-[#315F86] text-white shadow-2xs'
                : 'text-[#71706F] hover:text-[#343338]'
              }`}
          >
            Trên hộp
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center gap-1.5 rounded-full bg-[#F8F1E5] p-1 text-xs">
        <button
          type="button"
          onClick={() => setPreviewTab('default')}
          className={`rounded-full px-3 py-1 font-medium transition-all ${previewTab === 'default'
              ? 'bg-[#315F86] text-white shadow-2xs'
              : 'text-[#71706F] hover:text-[#343338]'
            }`}
        >
          Bìa
        </button>
        <button
          type="button"
          onClick={() => setPreviewTab('mockup')}
          className={`rounded-full px-3 py-1 font-medium transition-all ${previewTab === 'mockup'
              ? 'bg-[#315F86] text-white shadow-2xs'
              : 'text-[#71706F] hover:text-[#343338]'
            }`}
        >
          Mockup
        </button>
      </div>
    );
  };

  const previewBody = (
    <div className="flex flex-col gap-4">
      {/* Artwork Canvas Stage */}
      <div className="relative flex w-full items-center justify-center overflow-hidden rounded-2xl border border-[#DED7CD] bg-[#F8F1E5] p-4 sm:p-6 shadow-inner">
        <div className="w-full max-w-[280px] sm:max-w-[320px]">
          <AspectRatio ratio={ratio}>
            <div className="flex h-full w-full items-center justify-center drop-shadow-md">
              {isLoadingVersion ? (
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#315F86] border-t-transparent" />
                  <span className="text-xs text-[#71706F]">Đang nạp bố cục...</span>
                </div>
              ) : templateItem.thumbnailUrl && !versionPayload ? (
                <img
                  src={templateItem.thumbnailUrl}
                  alt={templateItem.name}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <DesignCanvas
                  productId={product.id}
                  text={versionPayload?.document?.text ?? templateItem.name}
                  color={versionPayload?.document?.color ?? '#2E3338'}
                  backgroundColor={versionPayload?.document?.backgroundColor ?? '#FFFFFF'}
                  image={versionPayload?.document?.image ?? null}
                  productOptions={previewOptions}
                  isMockup={previewTab !== 'default'}
                />
              )}
            </div>
          </AspectRatio>
        </div>
      </div>

      {/* Product-Specific Preview Options */}
      <div className="flex justify-center">{renderProductTabs()}</div>

      {/* Template Metadata */}
      <div className="rounded-xl border border-[#EBE5DC] bg-white p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-serif text-base sm:text-lg font-bold text-[#343338]">
              {templateItem.name}
            </h3>
            <p className="text-xs text-[#71706F] mt-0.5">
              {product.cardTitle} · {currentVariant.name}
            </p>
          </div>
          <span className="inline-flex rounded-full bg-[#DCE7D8] px-2.5 py-0.5 text-xs font-semibold text-[#343338]">
            Có thể thay ảnh & chữ
          </span>
        </div>
      </div>
    </div>
  );

  // Desktop dialog
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg rounded-2xl border-[#DED7CD] bg-[#FFFDF8] p-6 shadow-xl">
          <DialogHeader className="text-left pb-1">
            <DialogTitle className="font-serif text-xl font-bold text-[#343338]">
              Xem trước mẫu thiết kế
            </DialogTitle>
            <DialogDescription className="text-xs text-[#71706F]">
              Kiểm tra chi tiết bố cục trước khi bắt đầu chỉnh sửa.
            </DialogDescription>
          </DialogHeader>

          {previewBody}

          <div className="mt-4 flex items-center justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-11 rounded-xl border-[#DED7CD] px-4 text-xs font-semibold text-[#343338] hover:bg-[#F8F1E5]"
            >
              Đóng
            </Button>
            <Button
              type="button"
              onClick={() => onApply(id)}
              className="h-11 rounded-xl bg-[#315F86] px-5 text-xs font-semibold text-white shadow-xs hover:bg-[#274D6C]"
            >
              <Check size={15} className="mr-1.5" />
              <span>Dùng mẫu này</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Mobile drawer
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="rounded-t-[24px] border-t border-[#DED7CD] bg-[#FFFDF8] px-4 pb-6 pt-3 outline-none">
        <DrawerHeader className="p-0 pb-3 text-left">
          <div className="flex items-center justify-between">
            <DrawerTitle className="font-serif text-lg font-bold text-[#343338]">
              Xem trước mẫu
            </DrawerTitle>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F8F1E5] text-[#71706F] hover:text-[#343338]"
              aria-label="Đóng xem trước"
            >
              <X size={16} />
            </button>
          </div>
          <DrawerDescription className="text-xs text-[#71706F]">
            Kiểm tra bố cục trước khi vào trình sửa.
          </DrawerDescription>
        </DrawerHeader>

        <div className="max-h-[70vh] overflow-y-auto px-0.5">{previewBody}</div>

        <DrawerFooter className="p-0 pt-4">
          <Button
            type="button"
            onClick={() => onApply(id)}
            className="h-12 w-full rounded-xl bg-[#315F86] text-sm font-semibold text-white shadow-md active:bg-[#274D6C]"
          >
            <Check size={16} className="mr-1.5" />
            <span>Dùng mẫu này</span>
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

// ponytail: responsive preview modal without full screen zoom → skipped: pinch-zoom in mobile drawer, add when customer mobile detail view demands zoom.
