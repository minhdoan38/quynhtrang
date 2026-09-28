'use client';

import type { PatternWorkspaceView } from '@/lib/product-state';

interface PatternWorkspaceToggleProps {
  value: PatternWorkspaceView;
  onChange: (value: PatternWorkspaceView) => void;
}

export function PatternWorkspaceToggle({ value, onChange }: PatternWorkspaceToggleProps) {
  const tabs: Array<{ value: PatternWorkspaceView; label: string }> = [
    { value: 'edit-pattern', label: 'Chỉnh họa tiết' },
    { value: 'full-sheet-preview', label: 'Xem toàn tờ' },
  ];

  return (
    <div
      role="tablist"
      aria-label="Không gian làm việc họa tiết"
      className="inline-flex rounded-xl border border-[#DDD6CC] bg-[#FFFDF8] p-1 shadow-xs"
    >
      {tabs.map((tab) => {
        const selected = value === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86] ${selected ? 'bg-[#315F86] text-white shadow-xs' : 'text-[#666A6D] hover:bg-[#F8F3E8]'
              }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
