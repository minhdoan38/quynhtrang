import { redirect } from 'next/navigation.js';
import { createServerSupabaseClient } from '@/lib/supabase/server.ts';
import { CustomerNavHeader } from '@/components/layout/customer-nav-header.tsx';
import { MyDesignsList, type CustomerProjectItem } from '@/components/customer/my-designs-list.tsx';
import type { DesignState, ProductId } from '@/lib/product-state.ts';

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

  const projects: CustomerProjectItem[] = (projectsData || []).map((p: any) => {
    const doc = (p.working_document || p.current_design_document || {}) as DesignState;
    return {
      id: p.id,
      productId: (p.product_id as ProductId) || doc.productId || 'wrapping',
      variantId: p.variant_id || doc.variantId || 'a1',
      document: {
        productId: (p.product_id as ProductId) || doc.productId || 'wrapping',
        variantId: p.variant_id || doc.variantId || 'a1',
        templateId: doc.templateId ?? null,
        text: doc.text || '',
        color: doc.color || '#000000',
        backgroundColor: doc.backgroundColor || '#ffffff',
        image: doc.image || null,
        productOptions: doc.productOptions || {},
        elements: doc.elements,
        quantity: doc.quantity || 1,
      },
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
