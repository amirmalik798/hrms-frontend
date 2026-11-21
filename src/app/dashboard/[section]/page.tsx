import { notFound } from "next/navigation";
import { SuperAdminResourcePage, type SuperAdminSection } from "@/features/super-admin/SuperAdminResourcePage";
const supported = new Set<SuperAdminSection>(["organizations", "organization-admins", "invitations", "audit-logs", "payments", "support", "system-health"]);
export default async function Page({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; if (!supported.has(section as SuperAdminSection)) notFound(); return <SuperAdminResourcePage section={section as SuperAdminSection}/>; }
