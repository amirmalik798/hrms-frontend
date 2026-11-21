import { SuperAdminResourcePage } from "@/features/super-admin/SuperAdminResourcePage";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <SuperAdminResourcePage section="organization-detail" organizationId={id}/>; }
