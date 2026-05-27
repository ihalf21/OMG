import React, { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark';

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
}

export default function Topbar({ theme, onToggleTheme }: Props) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = time.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
  const isDark = theme === 'dark';

  return (
    <div style={{
      background: 'var(--bg-primary)',
      borderBottom: '0.5px solid var(--border-light)',
      padding: '0 24px',
      height: 48,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 16,
      flexShrink: 0,
    }}>
      {/* Clock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
        <span style={{ fontSize: 15 }}>🕐</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: 'var(--text-primary)' }}>{timeStr}</span>
        <span style={{ color: 'var(--text-tertiary)' }}>{dateStr}</span>
      </div>

      {/* Theme toggle */}
      <button
        onClick={onToggleTheme}
        title={isDark ? 'Светлая тема' : 'Тёмная тема'}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '6px 14px',
          border: `1.5px solid var(--border-mid)`,
          borderRadius: 20,
          background: isDark ? 'var(--accent-bg)' : 'var(--bg-secondary)',
          fontSize: 13,
          color: 'var(--text-primary)',
          cursor: 'pointer',
          fontWeight: 500,
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-mid)')}
      >
        <span style={{ fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</span>
        {isDark ? 'Светлая' : 'Тёмная'}
      </button>
    </div>
  );
}
