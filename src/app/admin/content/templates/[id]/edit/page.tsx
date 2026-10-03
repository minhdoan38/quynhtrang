import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/admin/authorization';
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
  const supabase = await createServerSupabaseClient();
  const repo = new TemplateRepository(supabase);
  const service = new TemplateManagementService(repo);

  let detail;
  try {
    detail = await service.getTemplateDetail(id);
  } catch {
    notFound();
  }

  if (!detail || !detail.template || !detail.draft) {
    notFound();
  }

  return (
    <TemplateAuthorClient
      template={detail.template}
      initialDraft={detail.draft}
      currentStaff={staff}
    />
  );
}
