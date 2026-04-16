// src/components/layout/ThemeToggle.tsx

import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/store/useTheme';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className="theme-toggle-btn"
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}