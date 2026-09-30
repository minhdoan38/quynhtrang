import { notFound } from 'next/navigation.js';
import { requireStaff } from '@/lib/admin/authorization.ts';
import { DesignVersionRepository } from '@/lib/repositories/design-version-repository.ts';
import { createServerSupabaseClient } from '@/lib/supabase/server.ts';
import { ApprovedDesignInspector } from '@/components/admin/approved-design-inspector.tsx';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderDesignInspectionPage({
  params,
}: PageProps) {
  const { id } = await params;
  if (!id) {
    notFound();
  }

  const staff = await requireStaff();
  const supabase = await createServerSupabaseClient();
  const designRepo = new DesignVersionRepository(supabase);
  const data = await designRepo.getApprovedDesignForStaff(id, staff);

  if (!data) {
    notFound();
  }

  return (
    <ApprovedDesignInspector
      orderId={data.orderId}
      publicOrderCode={data.publicOrderCode}
      versionNumber={data.versionNumber}
      source={data.source}
      designDocument={data.designDocument}
      preflight={data.preflight}
    />
  );
}
