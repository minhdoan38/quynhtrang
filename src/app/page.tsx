import { CustomizerShell } from '@/components/customizer/customizer-shell';
import { createServerSupabaseClient } from '@/lib/supabase/server.ts';
import { ProjectRepository } from '@/lib/repositories/project-repository.ts';
import type { CustomerEditorContext } from '@/lib/editor-context.ts';

export default async function Home(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const projectId = typeof searchParams?.project === 'string' ? searchParams.project : null;

  if (projectId) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user) {
        const repo = new ProjectRepository(supabase);
        const record = await repo.getById(projectId);
        if (record && record.workingDocument && (record.ownerUserId === authData.user.id || !record.ownerUserId)) {
          const context: CustomerEditorContext = {
            type: 'customer',
            projectId: record.id,
            initialRevision: record.currentWorkingRevision,
            initialDocument: record.workingDocument,
          };
          return <CustomizerShell context={context} initialSearchParams={searchParams} />;
        }
      }
    } catch {
      // Fall through to client-side CustomizerShell conflict handling
    }
  }

  return <CustomizerShell initialSearchParams={searchParams} />;
}
