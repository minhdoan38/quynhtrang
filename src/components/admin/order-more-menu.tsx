import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, PauseCircle } from 'lucide-react';

export interface OrderMoreMenuProps {
  canHold: boolean;
  onHoldIntent: () => void;
}

export function OrderMoreMenu({ canHold, onHoldIntent }: OrderMoreMenuProps) {
  if (!canHold) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 shadow-xs outline-none"
        aria-label="Thao tác khác"
      >
        <MoreHorizontal className="w-4 h-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={onHoldIntent}
          className="text-amber-700 hover:text-amber-800 hover:bg-amber-50 cursor-pointer"
        >
          <PauseCircle className="w-4 h-4 mr-2" />
          <span>Tạm giữ đơn</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
