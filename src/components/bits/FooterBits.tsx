'use client';

import type { ReactNode } from 'react';
import GlassIcons, { type GlassIconsItem } from '../GlassIcons';

interface FooterLink {
  label: string;
  href: string;
  icon: string;
}

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

export default function FooterBits({ links }: { links: FooterLink[] }) {
  const items: GlassIconsItem[] = links.map((link) => ({
    icon: ICONS[link.icon] ?? ICONS.book,
    label: link.label,
    href: link.href,
    color: '#7170ff'
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-10">
      <GlassIcons
        items={items}
        size={54}
        gap={14}
        columns={2}
        theme="dark"
        labels="hover"
        hover="lift"
        intro
      />
      <p className="mt-4 text-sm text-muted-foreground">© Тусовка. Час подій вказано за Києвом.</p>
    </div>
  );
}
