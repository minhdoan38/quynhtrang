import { redirect } from 'next/navigation.js';
import { createServerSupabaseClient } from '@/lib/supabase/server.ts';
import { CustomerNavHeader } from '@/components/layout/customer-nav-header.tsx';
import { MyDesignsList, type CustomerProjectItem } from '@/components/customer/my-designs-list.tsx';
import type { DesignState, ProductId } from '@/lib/product-state.ts';
import { readDesignDocument } from '@/lib/design-document.ts';
export default async function MyDesignsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user) {
    redirect('/login?returnUrl=/my-designs');
  }

  const { data: projectsData } = await supabase
    .from('projects')
    .select('id, product_id, variant_id, current_working_revision, working_document, current_design_document, updated_at')
    .eq('owner_user_id', authData.user.id)
    .order('updated_at', { ascending: false });

  interface ProjectRow {
    id: string;
    product_id?: ProductId | null;
    variant_id?: string | null;
    current_working_revision?: number | null;
    working_document?: unknown;
    current_design_document?: unknown;
    updated_at: string;
  }

  const projects: CustomerProjectItem[] = ((projectsData ?? []) as unknown as ProjectRow[]).map((p) => {
    const raw = (p.working_document || p.current_design_document || {}) as Record<string, unknown>;
    const productId = p.product_id || (raw.productId as ProductId) || 'wrapping';
    const variantId = p.variant_id || (typeof raw.variantId === 'string' ? raw.variantId : 'default');
    const normalizedRaw = { ...raw, productId, variantId };

    let document: DesignState;
    try {
      const schemaVer = typeof raw.documentSchemaVersion === 'number' ? raw.documentSchemaVersion : 0;
      document = readDesignDocument(normalizedRaw, schemaVer);
    } catch {
      document = {
        productId,
        variantId,
        templateId: typeof raw.templateId === 'string' ? raw.templateId : null,
        text: typeof raw.text === 'string' ? raw.text : '',
        color: typeof raw.color === 'string' ? raw.color : '#000000',
        backgroundColor: typeof raw.backgroundColor === 'string' ? raw.backgroundColor : '#ffffff',
        image: (raw.image as DesignState['image']) ?? null,
        productOptions: (raw.productOptions as Record<string, unknown>) || {},
        elements: (raw.elements as DesignState['elements']) || [],
        quantity: typeof raw.quantity === 'number' ? raw.quantity : 1,
        sourceTemplate: raw.sourceTemplate as DesignState['sourceTemplate'],
        documentSchemaVersion: typeof raw.documentSchemaVersion === 'number' ? raw.documentSchemaVersion : 1,
      };
    }
    return {
      id: p.id,
      productId: (p.product_id as ProductId) || document.productId,
      variantId: p.variant_id || document.variantId,
      templateId: document.templateId ?? document.sourceTemplate?.templateId ?? null,
      document,
      revision: p.current_working_revision || 1,
      updatedAt: p.updated_at,
    };
  });

  return (
    <div className="min-h-screen bg-[#FFFDF8] flex flex-col">
      <CustomerNavHeader />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
        <div className="border-b border-[#ECE6DC] pb-4">
          <h1 className="text-2xl font-serif font-bold text-[#2E3338]">Thiết kế của tôi</h1>
          <p className="text-xs text-[#666A6D] mt-1">
            Các bản thiết kế đã được lưu vào tài khoản để bạn có thể tiếp tục chỉnh sửa bất kỳ lúc nào.
          </p>
        </div>

        <MyDesignsList projects={projects} />
      </main>
    </div>
  );
}
