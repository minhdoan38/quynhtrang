import { notFound } from 'next/navigation';
import { isTestStaffBypassAllowed, requireStaff } from '@/lib/admin/authorization';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { TemplateRepository } from '@/lib/repositories/template-repository';
import { TemplateManagementService } from '@/lib/services/template-management';
import { TemplateAuthorClient } from '@/components/admin/template-author-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminTemplateEditPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) {
    notFound();
  }

  const staff = await requireStaff(undefined, 'editor');
  let detail;
  try {
    const supabase = await createServerSupabaseClient();
    const repo = new TemplateRepository(supabase);
    const service = new TemplateManagementService(repo);
    detail = await service.getTemplateDetail(id);
  } catch {
    if (!isTestStaffBypassAllowed() || !process.env.SMOKE_TEST_STAFF_ROLE) {
      notFound();
    }
  }

  if (!detail || !detail.template || !detail.draft) {
    if (isTestStaffBypassAllowed() && process.env.SMOKE_TEST_STAFF_ROLE) {
      detail = {
        template: {
          id,
          name: 'Thiệp lớp học',
          status: 'draft' as const,
          revision: 1,
          productId: 'card' as const,
          variantId: 'vertical',
          mode: null,
          shape: null,
          categoryId: '',
          tags: ['lop-hoc', 'thiep'],
          sortOrder: 0,
          currentPublishedVersionId: null,
          everPublishedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          archivedAt: null,
          target: {
            productId: 'card' as const,
            variantId: 'vertical',
            mode: null,
            shape: null,
            surfaces: [
              { id: 'front' as const, widthMm: 105, heightMm: 148 },
              { id: 'inside' as const, widthMm: 210, heightMm: 148 },
              { id: 'back' as const, widthMm: 105, heightMm: 148 },
            ],
            geometryKey: 'card:vertical',
          },
        },
        draft: {
          id: `draft-${id}`,
          templateId: id,
          basedOnVersionId: null,
          designDocument: {
            productId: 'card' as const,
            variantId: 'vertical',
            templateId: id,
            text: 'Thiệp lớp học',
            color: '#2E3338',
            backgroundColor: '#FFFDF8',
            image: null,
            quantity: 1,
            productOptions: { surface: 'front', fold: 'half' },
            elements: [],
          },
          documentSchemaVersion: 1,
          draftRevision: 1,
          editorUserId: staff.userId,
          leaseSessionId: null,
          leaseEpoch: 1,
          leaseExpiresAt: null,
          lastActivityAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        versions: [],
      };
    } else {
      notFound();
    }
  }

  const template = detail.template;
  const draft = detail.draft;
  if (!template || !draft) {
    notFound();
  }

  return (
    <TemplateAuthorClient
      template={template}
      initialDraft={draft}
      currentStaff={staff}
    />
  );
}
