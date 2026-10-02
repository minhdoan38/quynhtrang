import { redirect } from 'next/navigation';
import { getOptionalStaff } from '@/lib/admin/authorization';
import { LibraryFonts } from '@/components/admin/library-fonts';

export default async function AdminFontsPage() {
  const staff = await getOptionalStaff();
  if (!staff) {
    redirect('/admin/login');
  }

  return <LibraryFonts userRole={staff.role} />;
}
