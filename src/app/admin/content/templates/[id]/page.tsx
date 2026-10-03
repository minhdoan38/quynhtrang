import { notFound, redirect } from 'next/navigation';
import { getOptionalStaff } from '@/lib/admin/authorization';
import { TemplateDetail } from '@/components/admin/template-detail';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminTemplateDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) {
    notFound();
  }

  const staff = await getOptionalStaff();
  if (!staff) {
    redirect('/admin/login');
  }

  return <TemplateDetail templateId={id} userRole={staff.role} currentStaff={staff} />;
}
