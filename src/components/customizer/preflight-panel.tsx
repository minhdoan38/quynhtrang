import React from 'react';
import type { PreflightResult } from '@/lib/product-state';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface PreflightPanelProps {
  preflight: PreflightResult;
}

export function PreflightPanel({ preflight }: PreflightPanelProps) {
  return (
    <div id="preflight" className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Độ sẵn sàng in ấn
        </h3>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            preflight.level === 'pass'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              : preflight.level === 'warning'
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
          }`}
        >
          {preflight.level === 'pass' ? 'Đạt chuẩn' : preflight.level === 'warning' ? 'Cảnh báo' : 'Lỗi'}
        </span>
      </div>

      <div id="preflight-checks" className="space-y-1.5 pt-1 text-sm">
        {preflight.checks.map((check) => (
          <div key={check.id} className="flex items-start gap-2 text-xs">
            {check.level === 'pass' && (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            )}
            {check.level === 'warning' && (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            {check.level === 'error' && (
              <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <span className="text-muted-foreground">{check.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
