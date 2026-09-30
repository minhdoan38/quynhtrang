import { notFound, redirect } from 'next/navigation.js';
import { createServerSupabaseClient } from '@/lib/supabase/server.ts';
import { CustomerNavHeader } from '@/components/layout/customer-nav-header.tsx';
import {
  CustomerOrderDetailView,
  type CustomerOrderDetailData,
} from '@/components/customer/customer-order-detail-view.tsx';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerOrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user) {
    redirect(`/login?returnUrl=/my-orders/${id}`);
  }

  const { data: orderData, error } = await supabase.rpc('get_customer_order_detail', {
    p_order_id: id,
  });

  if (error || !orderData) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#FFFDF8] flex flex-col">
      <CustomerNavHeader />

      <main className="flex-1 py-4">
        <CustomerOrderDetailView order={orderData as CustomerOrderDetailData} />
      </main>
    </div>
  );
}
