import { redirect } from 'next/navigation';
import { getOptionalStaff } from '@/lib/admin/authorization';
import { LibraryStickers } from '@/components/admin/library-stickers';

export default async function AdminStickersPage() {
  const staff = await getOptionalStaff();
  if (!staff) {
    redirect('/admin/login');
  }

  return <LibraryStickers userRole={staff.role} />;
}
