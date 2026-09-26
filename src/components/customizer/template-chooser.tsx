import React from 'react';
import { Button } from '@/components/ui/button';

interface TemplateChooserProps {
  templateId: string | null;
  onSelectTemplate: (id: string) => void;
}

const TEMPLATE_LABELS: Record<string, string> = {
  blank: 'Trống',
  minimal: 'Tối giản',
  celebrate: 'Tiệc tùng',
};

export function TemplateChooser({ templateId, onSelectTemplate }: TemplateChooserProps) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        2. Chọn mẫu sẵn
      </h2>
      <div className="flex flex-wrap gap-2">
        {Object.entries(TEMPLATE_LABELS).map(([key, label]) => {
          const isSelected = templateId === key;
          return (
            <Button
              key={key}
              type="button"
              variant={isSelected ? 'default' : 'outline'}
              size="sm"
              data-action="select-template"
              data-value={key}
              onClick={() => onSelectTemplate(key)}
              className="text-xs font-medium"
            >
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
