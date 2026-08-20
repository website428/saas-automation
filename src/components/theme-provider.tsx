"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

/* ═══════════════════════════════════════════════════════════
   Theme Provider — Light (Warm Pastel) + Dark Mode
   ═══════════════════════════════════════════════════════════ */

export const lightTheme = {
    // Backgrounds
    page: '#FAF9F7',
    card: '#FFFFFF',
    cardHover: '#FDFCFA',
    cardInner: '#F7F5F2',
    border: '#EDE8E3',
    borderLight: '#F2EFE9',

    // Sidebar
    sidebar: '#FFFFFF',
    sidebarBorder: '#EDE8E3',

    // Accent — warm brown
    accent: '#8B7355',
    accentSoft: 'rgba(139, 115, 85, 0.08)',
    accentHover: 'rgba(139, 115, 85, 0.05)',
    accentBorder: 'rgba(139, 115, 85, 0.2)',

    // Text
    text: '#1A1A1A',
    textSec: '#6B6560',
    textMuted: '#A09A93',

    // Hover
    hover: '#F5F3F0',
    tableHeaderBg: '#FDFCFA',

    // Status
    green: '#6B9E78',
    greenSoft: 'rgba(107, 158, 120, 0.1)',
    greenBorder: 'rgba(107, 158, 120, 0.25)',
    amber: '#C49A52',
    amberSoft: 'rgba(196, 154, 82, 0.1)',
    amberBorder: 'rgba(196, 154, 82, 0.25)',
    coral: '#C47058',
    coralSoft: 'rgba(196, 112, 88, 0.1)',
    coralBorder: 'rgba(196, 112, 88, 0.25)',
    blue: '#7087A8',
    blueSoft: 'rgba(112, 135, 168, 0.1)',

    // Typography
    font: "'Inter', -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', monospace",
};

export const darkTheme = {
    // Backgrounds
    page: '#111110',
    card: '#1A1918',
    cardHover: '#1E1D1C',
    cardInner: '#151413',
    border: '#2A2826',
    borderLight: '#222120',

    // Sidebar
    sidebar: '#161514',
    sidebarBorder: '#2A2826',

    // Accent — warm golden
    accent: '#C9A96E',
    accentSoft: 'rgba(201, 169, 110, 0.1)',
    accentHover: 'rgba(201, 169, 110, 0.06)',
    accentBorder: 'rgba(201, 169, 110, 0.25)',

    // Text
    text: '#EDECE9',
    textSec: '#A09B94',
    textMuted: '#6B665F',

    // Hover
    hover: '#1E1D1C',
    tableHeaderBg: '#1E1D1C',

    // Status
    green: '#7AB887',
    greenSoft: 'rgba(122, 184, 135, 0.12)',
    greenBorder: 'rgba(122, 184, 135, 0.25)',
    amber: '#D4AA5E',
    amberSoft: 'rgba(212, 170, 94, 0.12)',
    amberBorder: 'rgba(212, 170, 94, 0.25)',
    coral: '#D47A62',
    coralSoft: 'rgba(212, 122, 98, 0.12)',
    coralBorder: 'rgba(212, 122, 98, 0.25)',
    blue: '#8599B8',
    blueSoft: 'rgba(133, 153, 184, 0.12)',

    // Typography
    font: "'Inter', -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', monospace",
};

export type Theme = typeof lightTheme;

interface ThemeContextType {
    theme: Theme;
    isDark: boolean;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
    theme: lightTheme,
    isDark: false,
    toggleTheme: () => { },
});

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem("coldreach-theme");
        if (stored === "dark") {
            setIsDark(true);
        } else if (stored === null) {
            // Check system preference
            const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            setIsDark(prefersDark);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem("coldreach-theme", isDark ? "dark" : "light");
        document.documentElement.style.background = isDark ? darkTheme.page : lightTheme.page;
    }, [isDark]);

    const toggleTheme = () => setIsDark(!isDark);
    const theme = isDark ? darkTheme : lightTheme;

    return (
        <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
