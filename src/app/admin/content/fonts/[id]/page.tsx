import { redirect } from 'next/navigation';
import { getOptionalStaff } from '@/lib/admin/authorization';
import { LibraryFontDetail } from '@/components/admin/library-font-detail';

export default async function AdminFontFamilyDetailPage(
  context: { params: Promise<{ id: string }> }
) {
  const staff = await getOptionalStaff();
  if (!staff) {
    redirect('/admin/login');
  }

  const { id } = await context.params;
  return <LibraryFontDetail familyId={id} userRole={staff.role} />;
}
