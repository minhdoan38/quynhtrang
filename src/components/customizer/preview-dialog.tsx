import React from 'react';
import type { DesignState, DesignSummary, PreflightResult } from '@/lib/product-state';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DesignCanvas } from './design-canvas';
import { PreflightPanel } from './preflight-panel';

interface PreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedToCheckout: () => void;
  state: DesignState;
  summary: DesignSummary;
  preflight: PreflightResult;
  onSelectProblemObject?: (target: 'image' | 'text') => void;
}

export function PreviewDialog({
  isOpen,
  onClose,
  onProceedToCheckout,
  state,
  summary,
  preflight,
  onSelectProblemObject,
}: PreviewDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent id="preview-modal" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle id="preview-title" className="text-base font-semibold">
            Xem thử thành phẩm
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-4">
          <div className="flex justify-center items-center py-6 bg-stone-100 dark:bg-stone-900 rounded-lg overflow-hidden min-h-[260px]">
            <DesignCanvas
              productId={state.productId}
              text={state.text}
              color={state.color}
              backgroundColor={state.backgroundColor}
              image={state.image}
              productOptions={state.productOptions}
              isMockup={true}
            />
          </div>

          <p className="preview-caption text-xs text-muted-foreground text-center font-medium">
            {summary.product} · {summary.variant}
          </p>

          <div id="preview-summary" className="bg-stone-50 dark:bg-stone-900/50 p-3 rounded-lg text-xs space-y-1.5 border">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sản phẩm:</span>
              <span className="font-semibold">{summary.product}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Khổ / loại:</span>
              <span className="font-semibold">{summary.variant}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Số lượng:</span>
              <span className="font-semibold">{summary.quantity}</span>
            </div>
            <div className="flex justify-between pt-1 border-t text-sm font-bold">
              <span>Tạm tính:</span>
              <span>{summary.priceLabel}</span>
            </div>
          </div>

          <PreflightPanel
            preflight={preflight}
            onSelectProblemObject={(target) => {
              onClose();
              onSelectProblemObject?.(target);
            }}
          />
        </div>

        <DialogFooter className="flex-row justify-end gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-action="back-to-editor"
            onClick={onClose}
          >
            Chỉnh sửa
          </Button>
          <Button
            type="button"
            size="sm"
            data-action="open-checkout"
            onClick={onProceedToCheckout}
          >
            Tiếp tục đặt hàng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
