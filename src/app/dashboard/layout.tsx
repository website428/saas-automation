"use client";

import Sidebar from "@/components/sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { theme: t } = useTheme();
  return (
    <div style={{ minHeight: '100vh', background: t.page, transition: 'background 300ms ease' }}>
      <Sidebar />
      {/* Desktop: margin-left for sidebar. Mobile: padding-top for top bar */}
      <main
        className="dash-main"
        style={{ marginLeft: '240px', minHeight: '100vh' }}
      >
        <div className="dash-inner" style={{ maxWidth: '1360px', margin: '0 auto', padding: '32px 40px' }}>
          {children}
        </div>
      </main>
      <style>{`
        @media (max-width: 768px) {
          .dash-main { margin-left: 0 !important; }
          .dash-inner { padding: 72px 16px 40px !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .dash-inner { padding: 24px 24px 40px !important; }
        }
        @media (min-width: 1025px) and (max-width: 1280px) {
          .dash-inner { padding: 28px 32px 40px !important; }
        }
      `}</style>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <DashboardContent>{children}</DashboardContent>
    </ThemeProvider>
  );
}
