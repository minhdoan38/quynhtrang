import { notFound } from 'next/navigation.js';
import { requireStaff } from '@/lib/admin/authorization.ts';
import { OrderRepository } from '@/lib/repositories/order-repository.ts';
import { createServerSupabaseClient } from '@/lib/supabase/server.ts';
import { OrderDetailClient } from './order-detail-client.tsx';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  if (!id) {
    notFound();
  }

  const staff = await requireStaff();
  const supabase = await createServerSupabaseClient();
  const orderRepo = new OrderRepository(supabase);
  const detail = await orderRepo.getOrderDetail(id, staff, { eventLimit: 20 });

  if (!detail) {
    notFound();
  }

  const { returnTo } = await searchParams;
  const safeReturnTo =
    returnTo && returnTo.startsWith('/admin/orders') ? returnTo : '/admin/orders';

  return (
    <OrderDetailClient
      initialDetail={detail}
      staff={staff}
      returnTo={safeReturnTo}
    />
  );
}
