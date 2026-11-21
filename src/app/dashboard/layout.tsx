import type { ReactNode } from "react";
import { SuperAdminGate } from "@/components/super-admin/SuperAdminGate";

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return <SuperAdminGate>{children}</SuperAdminGate>;
}
