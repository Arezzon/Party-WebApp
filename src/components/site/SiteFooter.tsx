'use client';

import type { ReactNode } from 'react';
import GlassIcons, { type GlassIconsItem } from '../GlassIcons';

const ICONS: Record<string, ReactNode> = {
  shield: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 5 6v5c0 4.6 3 8.2 7 10 4-1.8 7-5.4 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  book: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
    </svg>
  )
};

export default function SiteFooter() {
  const items: GlassIconsItem[] = [
    { icon: ICONS.shield, label: 'Конфіденційність', href: '/privacy', color: '#10e0ff' },
    { icon: ICONS.book, label: 'Правила', href: '/rules', color: '#ff2d87' }
  ];

  return (
    <footer className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-10">
      <div className="vc-divider mb-6" />
      <GlassIcons
        items={items}
        size={52}
        gap={14}
        columns={2}
        theme="dark"
        labels="hover"
        hover="lift"
        intro
      />
      <p className="mt-4 text-center text-xs tracking-wide text-muted-foreground sm:text-sm">
        © Тусовка · Час подій за Києвом · After dark, on purpose.
      </p>
    </footer>
  );
}
