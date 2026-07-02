import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  bg: string;
  bgCard: string;
  bgSubtle: string;
  bgInput: string;
  bgHover: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderLight: string;
  accent: string;
  accentLight: string;
  error: string;
  errorBg: string;
  warning: string;
  warningBg: string;
  success: string;
  successBg: string;
  shadow: string;
  navBg: string;
  navText: string;
  navTextActive: string;
  navAccent: string;
  heroBg: string;
  overlay: string;
}

export const lightColors: ThemeColors = {
  bg: '#EDEDEE',
  bgCard: '#FFFFFF',
  bgSubtle: '#F8F9FC',
  bgInput: '#F2F2F2',
  bgHover: '#F5F5F5',
  textPrimary: '#1B2A4A',
  textSecondary: '#6B6B6B',
  textTertiary: '#9CA3AF',
  border: '#C8C8C8',
  borderLight: '#E8EBF4',
  accent: '#7B1C3E',
  accentLight: '#F5E6EC',
  error: '#B91C1C',
  errorBg: '#FEE2E2',
  warning: '#B45309',
  warningBg: '#FEF3C7',
  success: '#059669',
  successBg: '#E6F6EF',
  shadow: 'rgba(27,42,74,0.10)',
  navBg: '#1B2A4A',
  navText: 'rgba(255,255,255,0.65)',
  navTextActive: '#FFFFFF',
  navAccent: '#7B1C3E',
  heroBg: '#1B2A4A',
  overlay: 'rgba(0,0,0,0.5)',
};

export const darkColors: ThemeColors = {
  bg: '#0F172A',
  bgCard: '#1E293B',
  bgSubtle: '#24344F',
  bgInput: '#1A2538',
  bgHover: '#2A3A55',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textTertiary: '#64748B',
  border: '#334155',
  borderLight: '#1E293B',
  accent: '#EC4899',
  accentLight: '#4C1D2F',
  error: '#F87171',
  errorBg: '#450A0A',
  warning: '#FBBF24',
  warningBg: '#451A03',
  success: '#34D399',
  successBg: '#064E3B',
  shadow: 'rgba(0,0,0,0.40)',
  navBg: '#0B1120',
  navText: 'rgba(255,255,255,0.55)',
  navTextActive: '#FFFFFF',
  navAccent: '#EC4899',
  heroBg: '#0B1120',
  overlay: 'rgba(0,0,0,0.7)',
};

interface ThemeContextValue {
  theme: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (t: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children, initialTheme }: { children: ReactNode; initialTheme?: ThemeMode }) {
  const [theme, setThemeState] = useState<ThemeMode>(initialTheme || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  const colors = theme === 'dark' ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: 'light',
      colors: lightColors,
      toggleTheme: () => {},
      setTheme: () => {},
    };
  }
  return ctx;
}
