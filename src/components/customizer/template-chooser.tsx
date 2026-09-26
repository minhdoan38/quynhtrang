import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TEMPLATES } from '@/lib/product-state';

interface TemplateChooserProps {
  templateId: string | null;
  onSelectTemplate: (id: string) => void;
  onOpenTemplateBrowser?: () => void;
}

export function TemplateChooser({
  templateId,
  onSelectTemplate,
  onOpenTemplateBrowser,
}: TemplateChooserProps) {
  const currentTemplate = templateId ? TEMPLATES[templateId] : null;

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
        {/* Quick picks */}
        {['blank', 'minimal', 'celebrate'].map((key) => {
          const tpl = TEMPLATES[key];
          if (!tpl) return null;
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
              {tpl.name}
            </Button>
          );
        })}

        {/* If another template is currently selected from the browser, show active pill */}
        {templateId && !['blank', 'minimal', 'celebrate'].includes(templateId) && currentTemplate && (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="text-xs font-medium bg-[#315F86]"
          >
            {currentTemplate.name}
          </Button>
        )}
      </div>
    </div>
  );
}
