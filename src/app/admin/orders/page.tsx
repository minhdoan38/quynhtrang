import type { Metadata } from 'next';
import { requireStaff } from '@/lib/admin/authorization';
import {
  parseInboxQueryParams,
  toOrderListQuery,
  type InboxResponse,
} from '@/lib/admin/inbox-query';
import { OrderRepository } from '@/lib/repositories/order-repository';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { OrdersInboxClient } from './orders-inbox-client';

export const metadata: Metadata = {
  title: 'Hộp thư đơn hàng — Quản trị Quỳnh Trang Studio',
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminOrdersPage({ searchParams }: PageProps) {
  const staff = await requireStaff(undefined);
  const rawParams = await searchParams;
  const initialQuery = parseInboxQueryParams(rawParams);
  const listQuery = toOrderListQuery(initialQuery);

  const supabase = await createServerSupabaseClient();
  const orderRepo = new OrderRepository(supabase);

  const [{ rows, total }, counts] = await Promise.all([
    orderRepo.listInbox(listQuery, staff),
    orderRepo.countViews(staff),
  ]);

  const initialData: InboxResponse = {
    rows,
    counts,
    page: initialQuery.page,
    pageSize: initialQuery.pageSize,
    total,
  };

  return (
    <OrdersInboxClient
      initialData={initialData}
      initialQuery={initialQuery}
      role={staff.role}
    />
  );
}
