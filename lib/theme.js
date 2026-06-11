import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSettings, updateSettings } from './learning-store';

// ====== 主题预设 ======
export const THEMES = {
  midnight: {
    name: 'Midnight',
    preview: ['#0A0A0A', '#3B82F6'],
    bg: '#0A0A0A',
    card: '#FFFFFF',
    cardText: '#1E293B',
    cardSubText: '#64748B',
    text: '#FFFFFF',
    textDim: 'rgba(255,255,255,0.35)',
    textMuted: 'rgba(255,255,255,0.5)',
    accent: '#3B82F6',
    accentBg: 'rgba(59,130,246,0.15)',
    searchBg: 'rgba(255,255,255,0.08)',
    pillBg: 'rgba(255,255,255,0.06)',
    pillActiveBg: 'rgba(255,255,255,0.15)',
    headerBg: '#0A0A0A',
    tabBorder: 'rgba(255,255,255,0.08)',
    inputBg: '#F1F5F9',
    inputText: '#1E293B',
    border: '#E2E8F0',
    sectionBg: '#FFFFFF',
    barToday: '#3B82F6',
    barOther: '#CBD5E1',
  },
  snow: {
    name: 'Snow',
    preview: ['#F8FAFC', '#3B82F6'],
    bg: '#F8FAFC',
    card: '#FFFFFF',
    cardText: '#1E293B',
    cardSubText: '#64748B',
    text: '#1E293B',
    textDim: '#94A3B8',
    textMuted: '#64748B',
    accent: '#3B82F6',
    accentBg: 'rgba(59,130,246,0.1)',
    searchBg: 'rgba(0,0,0,0.05)',
    pillBg: '#F1F5F9',
    pillActiveBg: '#3B82F6',
    headerBg: '#FFFFFF',
    tabBorder: '#E2E8F0',
    inputBg: '#F1F5F9',
    inputText: '#1E293B',
    border: '#E2E8F0',
    sectionBg: '#FFFFFF',
    barToday: '#3B82F6',
    barOther: '#CBD5E1',
  },
  emerald: {
    name: 'Emerald',
    preview: ['#0A1A12', '#10B981'],
    bg: '#0A1A12',
    card: '#FFFFFF',
    cardText: '#1E293B',
    cardSubText: '#64748B',
    text: '#FFFFFF',
    textDim: 'rgba(255,255,255,0.35)',
    textMuted: 'rgba(255,255,255,0.5)',
    accent: '#10B981',
    accentBg: 'rgba(16,185,129,0.15)',
    searchBg: 'rgba(255,255,255,0.08)',
    pillBg: 'rgba(255,255,255,0.06)',
    pillActiveBg: 'rgba(255,255,255,0.15)',
    headerBg: '#0A1A12',
    tabBorder: 'rgba(255,255,255,0.08)',
    inputBg: '#F1F5F9',
    inputText: '#1E293B',
    border: '#E2E8F0',
    sectionBg: '#FFFFFF',
    barToday: '#10B981',
    barOther: '#A7F3D0',
  },
  sunset: {
    name: 'Sunset',
    preview: ['#1A0F0A', '#F59E0B'],
    bg: '#1A0F0A',
    card: '#FFFFFF',
    cardText: '#1E293B',
    cardSubText: '#64748B',
    text: '#FFFFFF',
    textDim: 'rgba(255,255,255,0.35)',
    textMuted: 'rgba(255,255,255,0.5)',
    accent: '#F59E0B',
    accentBg: 'rgba(245,158,11,0.15)',
    searchBg: 'rgba(255,255,255,0.08)',
    pillBg: 'rgba(255,255,255,0.06)',
    pillActiveBg: 'rgba(255,255,255,0.15)',
    headerBg: '#1A0F0A',
    tabBorder: 'rgba(255,255,255,0.08)',
    inputBg: '#F1F5F9',
    inputText: '#1E293B',
    border: '#E2E8F0',
    sectionBg: '#FFFFFF',
    barToday: '#F59E0B',
    barOther: '#FDE68A',
  },
  lavender: {
    name: 'Lavender',
    preview: ['#12101E', '#A78BFA'],
    bg: '#12101E',
    card: '#FFFFFF',
    cardText: '#1E293B',
    cardSubText: '#64748B',
    text: '#FFFFFF',
    textDim: 'rgba(255,255,255,0.35)',
    textMuted: 'rgba(255,255,255,0.5)',
    accent: '#A78BFA',
    accentBg: 'rgba(167,139,250,0.15)',
    searchBg: 'rgba(255,255,255,0.08)',
    pillBg: 'rgba(255,255,255,0.06)',
    pillActiveBg: 'rgba(255,255,255,0.15)',
    headerBg: '#12101E',
    tabBorder: 'rgba(255,255,255,0.08)',
    inputBg: '#F1F5F9',
    inputText: '#1E293B',
    border: '#E2E8F0',
    sectionBg: '#FFFFFF',
    barToday: '#A78BFA',
    barOther: '#C4B5FD',
  },
};

export const THEME_KEYS = Object.keys(THEMES);

// ====== Context ======
const ThemeContext = createContext({
  theme: THEMES.midnight,
  themeKey: 'midnight',
  setThemeKey: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  const [themeKey, setThemeKeyState] = useState('midnight');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      if (s.theme && THEMES[s.theme]) {
        setThemeKeyState(s.theme);
      }
      setReady(true);
    })();
  }, []);

  const setThemeKey = useCallback(async (key) => {
    if (!THEMES[key]) return;
    setThemeKeyState(key);
    await updateSettings({ theme: key });
  }, []);

  if (!ready) return null;

  return (
    <ThemeContext.Provider value={{ theme: THEMES[themeKey], themeKey, setThemeKey }}>
      {children}
    </ThemeContext.Provider>
  );
}
