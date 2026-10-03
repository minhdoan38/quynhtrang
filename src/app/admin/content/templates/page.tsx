import { redirect } from 'next/navigation';
import { getOptionalStaff } from '@/lib/admin/authorization';
import { TemplateLibrary } from '@/components/admin/template-library';

export default async function AdminTemplatesPage() {
  const staff = await getOptionalStaff();
  if (!staff) {
    redirect('/admin/login');
  }

  return <TemplateLibrary userRole={staff.role} currentStaff={staff} />;
}
