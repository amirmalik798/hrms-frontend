"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Activity, AlertCircle, Building2, ChevronDown, ChevronsLeft, ChevronsRight, CreditCard, FileText, HeartHandshake, LayoutDashboard, LoaderCircle, LogOut, Mail, Menu, Moon, Search, ShieldCheck, Sun, Users, X } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/api-client";

interface SuperAdminUser { email: string; role: "SUPER_ADMIN" }
interface SuperAdminContextValue { user: SuperAdminUser }
const SuperAdminContext = createContext<SuperAdminContextValue | null>(null);
export function useSuperAdmin() {
  const value = useContext(SuperAdminContext);
  if (!value) throw new Error("useSuperAdmin must be used inside SuperAdminGate");
  return value;
}

const navGroups = [
  { label: "Platform", items: [
    { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
    { label: "Organizations", href: "/dashboard/organizations", icon: Building2 },
    { label: "Organization admins", href: "/dashboard/organization-admins", icon: Users },
  ] },
  { label: "Operations", items: [
    { label: "Invitations", href: "/dashboard/invitations", icon: Mail },
    { label: "Payments", href: "/dashboard/payments", icon: CreditCard },
    { label: "Platform support", href: "/dashboard/support", icon: HeartHandshake },
    { label: "Audit logs", href: "/dashboard/audit-logs", icon: FileText },
    { label: "System health", href: "/dashboard/system-health", icon: Activity },
  ] },
];

function LoadingScreen({ label }: { label: string }) {
  return <main className="loading-state" style={{ minHeight: "100vh", display: "grid", alignContent: "center", justifyContent: "center" }}><div className="state-icon"><LoaderCircle className="spin" size={20} /></div><p>{label}</p></main>;
}

export function SuperAdminGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SuperAdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [logoutBusy, setLogoutBusy] = useState(false);

  const verifySession = useCallback(async () => {
    setChecking(true); setError("");
    try {
      const result = await apiRequest<{ authenticated?: boolean; user?: { email?: string; role?: string } }>("/auth/me");
      if (!result.authenticated || result.user?.role !== "SUPER_ADMIN") {
        router.replace("/");
        return;
      }
      setUser({ email: typeof result.user.email === "string" ? result.user.email : "", role: "SUPER_ADMIN" });
    } catch (caught) {
      if (caught instanceof ApiError && [401, 403].includes(caught.status)) router.replace("/");
      else setError(caught instanceof Error ? caught.message : "Unable to verify platform access.");
    } finally { setChecking(false); }
  }, [router]);

  useEffect(() => { void verifySession(); }, [verifySession]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("hrms-super-admin-theme");
      const initial = saved === "light" ? "light" : "dark";
      setTheme(initial);
      document.documentElement.dataset.superAdminTheme = initial;
    } catch { document.documentElement.dataset.superAdminTheme = "dark"; }
    return () => { delete document.documentElement.dataset.superAdminTheme; };
  }, []);
  useEffect(() => { setMobileOpen(false); setCommandOpen(false); }, [pathname]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen((value) => !value); }
      if (event.key === "Escape") { setCommandOpen(false); setMobileOpen(false); setMenuOpen(false); }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  async function logout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await apiRequest("/auth/logout", { method: "POST" });
      router.replace("/"); router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign out. Please try again.");
      setLogoutBusy(false);
    }
  }
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next); document.documentElement.dataset.superAdminTheme = next;
    try { window.localStorage.setItem("hrms-super-admin-theme", next); } catch { /* session-only preference */ }
  }

  const allItems = useMemo(() => navGroups.flatMap((group) => group.items), []);
  const filtered = allItems.filter((item) => `${item.label} ${item.href}`.toLowerCase().includes(commandQuery.toLowerCase()));
  const active = allItems.find((item) => item.href === pathname || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`))) ?? allItems[0];
  if (checking && !user) return <LoadingScreen label="Verifying your platform administrator session…" />;
  if (error && !user) return <main className="error-state" style={{ minHeight: "100vh", display: "grid", alignContent: "center", justifyContent: "center" }}><div className="state-icon"><AlertCircle size={20}/></div><h3>Platform workspace unavailable</h3><p>{error}</p><button className="button button-secondary" onClick={() => void verifySession()}>Try again</button></main>;
  if (!user) return <LoadingScreen label="Opening platform workspace…" />;

  return <SuperAdminContext.Provider value={{ user }}>
    <div className={`app-shell ${theme === "dark" ? "super-admin-app-dark" : "super-admin-app-light"}`}>
      <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "sidebar-mobile-open" : ""}`}>
        <a href="/dashboard" className="brand"><span className="brand-mark"><ShieldCheck size={19}/></span><span className="brand-copy"><span className="brand-name">HRMS</span><span className="brand-caption">Platform control</span></span></a>
        <div className="sidebar-workspace"><span className="org-avatar"><ShieldCheck size={16}/></span><span className="sidebar-workspace-copy"><span className="sidebar-workspace-name">Platform workspace</span><span className="sidebar-workspace-role">Super administrator</span></span></div>
        <nav className="sidebar-nav" aria-label="Platform navigation">
          {navGroups.map((group) => <div className="nav-group" key={group.label}><p className="nav-group-label">{group.label}</p>{group.items.map((item) => { const Icon = item.icon; const selected = active.href === item.href; return <a key={item.href} href={item.href} className={`nav-link ${selected ? "nav-link-active" : ""}`} aria-current={selected ? "page" : undefined} title={collapsed ? item.label : undefined}><span className="nav-icon"><Icon size={17}/></span><span className="nav-label">{item.label}</span></a>; })}</div>)}
        </nav>
        <div className="sidebar-footer"><button type="button" className="sidebar-collapse" onClick={() => setCollapsed((value) => !value)}>{collapsed ? <ChevronsRight size={17}/> : <ChevronsLeft size={17}/>}<span>{collapsed ? "Expand" : "Collapse sidebar"}</span></button></div>
      </aside>
      <div className={`main-region ${collapsed ? "main-region-expanded" : ""}`}>
        <header className="topbar">
          <div className="topbar-left"><button type="button" className="icon-button mobile-menu-button" onClick={() => setMobileOpen((value) => !value)} aria-label="Toggle navigation">{mobileOpen ? <X size={19}/> : <Menu size={19}/>}</button><div className="topbar-org"><strong>Platform control</strong><span>{active.label}</span></div><span className="topbar-divider"/><button type="button" className="search-trigger" onClick={() => setCommandOpen(true)}><Search size={15}/><span>Search platform</span><kbd>⌘ K</kbd></button></div>
          <div className="topbar-actions"><button type="button" className="icon-button" onClick={toggleTheme} aria-label="Toggle theme">{theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}</button><span className="topbar-divider"/><div style={{ position: "relative" }}><button type="button" className="user-menu" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}><span className="user-avatar">{user.email.slice(0, 1).toUpperCase() || "S"}</span><span className="user-menu-copy"><strong>{user.email.split("@")[0] || "Super Admin"}</strong><span>Super Admin</span></span><ChevronDown size={14}/></button>{menuOpen ? <div className="panel" style={{ position: "absolute", top: 45, right: 0, zIndex: 50, width: 190, padding: 6, boxShadow: "var(--shadow)" }}><button type="button" className="command-result" style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }} onClick={() => void logout()} disabled={logoutBusy}><LogOut size={15}/>{logoutBusy ? "Signing out…" : "Sign out"}</button></div> : null}</div></div>
        </header>
        <main className="page-content">{error ? <div className="form-error workspace-toast" role="alert">{error}</div> : null}{children}</main>
      </div>
      {mobileOpen ? <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} style={{ position: "fixed", zIndex: 34, inset: 0, background: "rgba(15,23,42,.32)", border: 0 }}/> : null}
      <nav className="mobile-bottom-nav" aria-label="Quick navigation">{allItems.slice(0, 5).map((item) => { const Icon = item.icon; return <a key={item.href} className={pathname === item.href ? "active" : ""} href={item.href}><Icon size={17}/><span>{item.label}</span></a>; })}</nav>
      {commandOpen ? <div className="command-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommandOpen(false); }}><section className="command-panel" role="dialog" aria-modal="true" aria-label="Search platform"><input autoFocus className="command-input" placeholder="Search platform pages…" value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && filtered[0]) { router.push(filtered[0].href); setCommandOpen(false); setCommandQuery(""); } }}/><div className="command-results">{filtered.length ? filtered.map((item) => { const Icon = item.icon; return <button type="button" key={item.href} className="command-result" onClick={() => { router.push(item.href); setCommandOpen(false); setCommandQuery(""); }}><Icon size={16}/><span>{item.label}</span></button>; }) : <div className="empty-state"><h3>No matching pages</h3><p>Try another search.</p></div>}</div></section></div> : null}
    </div>
  </SuperAdminContext.Provider>;
}
