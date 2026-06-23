"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/hooks/useSession";
import { GoKwikLogoWhite } from "@/components/ui/GoKwikLogo";
import {
  LayoutDashboard,
  AlertTriangle,
  BarChart3,
  MessageSquare,
  Mail,
  Ticket,
  LogOut,
  ChevronRight,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Control Tower", icon: LayoutDashboard },
  { href: "/escalations", label: "Queries", icon: AlertTriangle },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/periskope", label: "WhatsApp Groups", icon: MessageCircle },
];

const sourceItems = [
  { href: "/escalations?source=gmail", label: "Gmail Threads", icon: Mail },
  { href: "/escalations?source=slack", label: "Slack DMs", icon: MessageSquare },
  { href: "/escalations?source=jira", label: "Jira Issues", icon: Ticket },
  { href: "/periskope", label: "WhatsApp Groups", icon: MessageCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useSession();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    const read = () => {
      const val = localStorage.getItem("pendingCount");
      if (val !== null) setPendingCount(parseInt(val));
    };
    read();
    window.addEventListener("pendingCountUpdate", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("pendingCountUpdate", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "CS";

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
    router.replace("/login");
  }

  return (
    <aside className="w-64 gradient-nav text-white flex flex-col shrink-0 h-full">
      <div className="px-6 pt-6 pb-4">
        <GoKwikLogoWhite size={38} />
        <p className="text-xs mt-1.5 opacity-50 font-label pl-0.5">KE Control Tower</p>
      </div>

      <div className="mx-6 h-px bg-white opacity-10 mb-4" />

      <nav className="flex-1 px-4 overflow-y-auto custom-scrollbar">
        <p className="text-xs uppercase tracking-widest opacity-40 font-label px-3 mb-2">Navigation</p>
        <div className="space-y-1 mb-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                  active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                <span className="flex-1">{item.label}</span>
                {item.label === "Queries" && pendingCount !== null && pendingCount > 0 && (
                  <span className="text-xs bg-error px-2 py-0.5 rounded-full font-semibold">{pendingCount}</span>
                )}
                {active && <ChevronRight size={14} className="opacity-60" />}
              </Link>
            );
          })}
        </div>

        <p className="text-xs uppercase tracking-widest opacity-40 font-label px-3 mb-2">Sources</p>
        <div className="space-y-1">
          {sourceItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/60 hover:bg-white/10 hover:text-white transition-all duration-150"
              >
                <Icon size={16} strokeWidth={1.5} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="px-4 pb-5 pt-3">
        <div className="mx-0 h-px bg-white opacity-10 mb-4" />
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
          {user?.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full shrink-0 object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container text-xs font-bold font-headline shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{user?.name ?? "CSM"}</p>
            <p className="text-xs text-white/50 truncate">{user?.email ?? ""}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
