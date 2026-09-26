import React from 'react';
import { Button } from '@/components/ui/button';
import { Undo2, Redo2, RotateCcw, Eye } from 'lucide-react';

interface BottomNavigationProps {
  onOpenPreview: () => void;
  onResetDesign: () => void;
  priceLabel: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function BottomNavigation({
  onOpenPreview,
  onResetDesign,
  priceLabel,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: BottomNavigationProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t px-4 py-2.5 flex items-center justify-between gap-3 max-w-4xl mx-auto shadow-lg sm:rounded-t-xl">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canUndo}
          onClick={onUndo}
          data-action="undo"
          title="Hoàn tác"
          className="h-8 w-8"
        >
          <Undo2 className="w-4 h-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canRedo}
          onClick={onRedo}
          data-action="redo"
          title="Làm lại"
          className="h-8 w-8"
        >
          <Redo2 className="w-4 h-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onResetDesign}
          data-action="reset-design"
          className="text-xs text-muted-foreground hover:text-foreground h-8 px-2 flex items-center gap-1"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Đặt lại</span>
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground block font-medium">
            Tạm tính
          </span>
          <span className="text-sm font-bold">{priceLabel}</span>
        </div>

        <Button
          type="button"
          size="sm"
          data-action="open-preview"
          onClick={onOpenPreview}
          className="flex items-center gap-1.5 font-semibold shadow-sm"
        >
          <Eye className="w-4 h-4" />
          <span>Xem thử</span>
        </Button>
      </div>
    </div>
  );
}
