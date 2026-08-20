"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard, Send, Users, Globe, ListOrdered,
    BarChart3, ShieldCheck, Settings, Zap, Sun, Moon, Menu, X, MessageSquare, Database, Megaphone
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";

const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Marketing", href: "/dashboard/marketing", icon: Megaphone },
    { label: "Automation", href: "/dashboard/automation", icon: Zap },
    { label: "Campaigns", href: "/dashboard/campaigns", icon: Send },
    { label: "Contacts", href: "/dashboard/contacts", icon: Users },
    { label: "Categories", href: "/dashboard/categories", icon: ListOrdered },
    { label: "Domains", href: "/dashboard/domains", icon: Globe },
    { label: "Queue", href: "/dashboard/queue", icon: ListOrdered },
    { label: "Inbox", href: "/dashboard/inbox", icon: MessageSquare },
    { label: "Database", href: "/dashboard/database", icon: Database },
    { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
];
const bottomItems = [
    { label: "Compliance", href: "/dashboard/compliance", icon: ShieldCheck },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
    const pathname = usePathname();
    const { theme: t, isDark, toggleTheme } = useTheme();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Logo */}
            <div style={{ height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: `1px solid ${t.sidebarBorder}`, flexShrink: 0 }}>
                <Link href="/dashboard" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
                    <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Zap style={{ width: '15px', height: '15px', color: isDark ? '#111110' : '#FFFFFF' }} />
                    </div>
                    <span style={{ fontSize: '16px', fontWeight: 600, letterSpacing: '-0.025em', color: t.text, fontFamily: t.font }}>ColdReach</span>
                </Link>
                {/* Close button — mobile only */}
                {onClose && (
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: t.textMuted }}>
                        <X style={{ width: '18px', height: '18px' }} />
                    </button>
                )}
            </div>

            {/* Nav */}
            <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto', overflowX: 'hidden' }}>
                <p style={{ padding: '0 12px', marginBottom: '8px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: t.textMuted, fontFamily: t.font }}>Platform</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    {navItems.map((item) => {
                        const isActive = item.href === "/dashboard"
                            ? pathname === "/dashboard"
                            : pathname === item.href || pathname.startsWith(item.href + '/');
                        const Icon = item.icon;
                        return (
                            <Link key={item.href} href={item.href} onClick={onClose}
                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: isActive ? 600 : 500, fontFamily: t.font, textDecoration: 'none', transition: 'all 150ms ease', background: isActive ? t.accentSoft : 'transparent', color: isActive ? t.accent : t.textSec }}
                                onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = t.hover; e.currentTarget.style.color = t.text; } }}
                                onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.textSec; } }}
                            >
                                <Icon style={{ width: '16px', height: '16px', flexShrink: 0, color: isActive ? t.accent : t.textMuted }} />
                                {item.label}
                            </Link>
                        );
                    })}
                </div>
            </nav>

            {/* Bottom */}
            <div style={{ padding: '12px 12px 16px', borderTop: `1px solid ${t.sidebarBorder}`, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {bottomItems.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                        <Link key={item.href} href={item.href} onClick={onClose}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: isActive ? 600 : 500, fontFamily: t.font, textDecoration: 'none', transition: 'all 150ms ease', background: isActive ? t.accentSoft : 'transparent', color: isActive ? t.accent : t.textSec }}
                            onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = t.hover; e.currentTarget.style.color = t.text; } }}
                            onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.textSec; } }}
                        >
                            <Icon style={{ width: '16px', height: '16px', flexShrink: 0, color: isActive ? t.accent : t.textMuted }} />
                            {item.label}
                        </Link>
                    );
                })}
                <button onClick={toggleTheme}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, fontFamily: t.font, border: 'none', cursor: 'pointer', transition: 'all 150ms ease', background: 'transparent', color: t.textSec, marginTop: '4px', width: '100%', textAlign: 'left' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = t.hover; e.currentTarget.style.color = t.text; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.textSec; }}
                >
                    {isDark ? <Sun style={{ width: '16px', height: '16px', color: t.textMuted }} /> : <Moon style={{ width: '16px', height: '16px', color: t.textMuted }} />}
                    {isDark ? 'Light Mode' : 'Dark Mode'}
                </button>
            </div>
        </div>
    );
}

export default function Sidebar() {
    const { theme: t } = useTheme();
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <>
            {/* ── Desktop sidebar ─────────────────────────── */}
            <aside className="sidebar-desktop" style={{
                position: 'fixed', left: 0, top: 0, bottom: 0, width: '240px',
                background: t.sidebar, borderRight: `1px solid ${t.sidebarBorder}`,
                zIndex: 50, transition: 'background 300ms ease, border-color 300ms ease',
            }}>
                <SidebarContent />
            </aside>

            {/* ── Mobile top bar ──────────────────────────── */}
            <header className="sidebar-mobile-bar" style={{
                display: 'none', position: 'fixed', top: 0, left: 0, right: 0, height: '56px',
                background: t.sidebar, borderBottom: `1px solid ${t.sidebarBorder}`,
                alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', zIndex: 50,
            }}>
                <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Zap style={{ width: '13px', height: '13px', color: '#FFF' }} />
                    </div>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: t.text }}>ColdReach</span>
                </Link>
                <button onClick={() => setMobileOpen(true)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: t.textSec }}>
                    <Menu style={{ width: '20px', height: '20px' }} />
                </button>
            </header>

            {/* ── Mobile overlay ──────────────────────────── */}
            {mobileOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onClick={() => setMobileOpen(false)}>
                    {/* Backdrop */}
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }} />
                    {/* Drawer */}
                    <aside
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            position: 'absolute', top: 0, left: 0, bottom: 0, width: '280px',
                            background: t.sidebar,
                            borderRight: `1px solid ${t.sidebarBorder}`,
                            animation: 'slideInLeft 200ms ease-out',
                        }}
                    >
                        <SidebarContent onClose={() => setMobileOpen(false)} />
                    </aside>
                </div>
            )}

            <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
          .sidebar-mobile-bar { display: flex !important; }
        }
      `}</style>
        </>
    );
}
