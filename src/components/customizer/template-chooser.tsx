'use client';

import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TemplateChooserProps {
  templateId: string | null;
  onApplyTemplate: (templateId: string, versionId?: string | null) => void;
  onSelectTemplate?: (id: string) => void;
  onOpenTemplateBrowser?: () => void;
  isAvailable?: boolean;
  availableTemplates?: string[];
}

export function TemplateChooser({
  templateId,
  onApplyTemplate,
  onSelectTemplate,
  onOpenTemplateBrowser,
  isAvailable,
  availableTemplates,
}: TemplateChooserProps) {
  const isBlankSelected = !templateId || templateId === 'blank';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          2. Chọn mẫu sẵn
        </h2>
        {onOpenTemplateBrowser && (
          <button
            type="button"
            onClick={onOpenTemplateBrowser}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#315F86] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#315F86]"
          >
            <Sparkles size={14} aria-hidden="true" />
            <span>Duyệt tất cả mẫu</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Blank template option - always retained outside catalog */}
        <Button
          type="button"
          variant={isBlankSelected ? 'default' : 'outline'}
          size="sm"
          data-action="select-template"
          data-value="blank"
          onClick={() => {
            if (onApplyTemplate) {
              onApplyTemplate('blank');
            } else if (onSelectTemplate) {
              onSelectTemplate('blank');
            }
          }}
          className="text-xs font-medium"
        >
          Mẫu trống
        </Button>

        {/* If a dynamic template is currently selected and available */}
        {templateId && templateId !== 'blank' && (isAvailable !== false) && (!availableTemplates || availableTemplates.includes(templateId)) && (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="text-xs font-medium bg-[#315F86]"
          >
            {templateId}
          </Button>
        )}
      </div>
    </div>
  );
}

// ponytail: basic template chooser pill row → skipped: dynamic quick picks row, add when customer quick pick curation is needed.
