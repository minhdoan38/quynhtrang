import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, PauseCircle, XCircle } from 'lucide-react';

export interface OrderMoreMenuProps {
  canHold: boolean;
  onHoldIntent: () => void;
  canCancel?: boolean;
  onCancelIntent?: () => void;
}

export function OrderMoreMenu({
  canHold,
  onHoldIntent,
  canCancel = false,
  onCancelIntent,
}: OrderMoreMenuProps) {
  if (!canHold && !canCancel) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 shadow-xs outline-none"
        aria-label="Thao tác khác"
      >
        <MoreHorizontal className="w-4 h-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {canHold && (
          <DropdownMenuItem
            onClick={onHoldIntent}
            className="text-amber-700 hover:text-amber-800 hover:bg-amber-50 cursor-pointer"
          >
            <PauseCircle className="w-4 h-4 mr-2" />
            <span>Tạm giữ đơn</span>
          </DropdownMenuItem>
        )}
        {canCancel && onCancelIntent && (
          <DropdownMenuItem
            onClick={onCancelIntent}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 cursor-pointer"
          >
            <XCircle className="w-4 h-4 mr-2" />
            <span>Hủy đơn hàng</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
