import { notFound } from 'next/navigation.js';
import { requireStaff } from '@/lib/admin/authorization.ts';
import { createServerSupabaseClient } from '@/lib/supabase/server.ts';
import { DesignRevisionRepository } from '@/lib/repositories/design-revision-repository.ts';
import { DesignReviewClient } from './design-review-client.tsx';

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

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, public_order_code, fulfillment_status, payment_status, design_status, customer_approved_design_version_id, production_design_version_id, project_id')
    .eq('id', id)
    .maybeSingle();

  if (orderError || !order) {
    notFound();
  }

  const revisionRepo = new DesignRevisionRepository(supabase);
  const versions = await revisionRepo.listVersions(id);
  const activeDraft = await revisionRepo.getActiveDraftSummary(id);

  let initialFullDraft = null;
  if (activeDraft && activeDraft.editorUserId === staff.userId) {
    initialFullDraft = await revisionRepo.getFullDraft(activeDraft.id);
  }

  const targetVersionId = order.production_design_version_id || order.customer_approved_design_version_id;
  const productionDocument = targetVersionId
    ? await revisionRepo.getVersionDocument(targetVersionId)
    : null;

  if (!productionDocument) {
    notFound();
  }

  const customerVer = versions.find((v) => v.isCustomer) || versions[0];
  const prodVer = versions.find((v) => v.isProduction) || versions[0];

  return (
    <DesignReviewClient
      orderId={order.id}
      publicOrderCode={order.public_order_code}
      fulfillmentStatus={order.fulfillment_status}
      paymentStatus={order.payment_status}
      designStatus={order.design_status}
      currentUserId={staff.userId}
      currentUserRole={staff.role}
      customerVersionNumber={customerVer?.versionNumber ?? 1}
      productionVersionNumber={prodVer?.versionNumber ?? 1}
      initialVersions={versions}
      initialActiveDraft={activeDraft}
      initialSelectedDocument={productionDocument}
      initialFullDraft={initialFullDraft}
    />
  );
}
