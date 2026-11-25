'use client';

import NeonLogo from '../NeonLogo';
import PillNav from '../PillNav';

interface Props {
  activeHref: string;
}

const LINKS = [
  { label: 'Події', href: '/' },
  { label: 'Створити', href: '/events/new' },
  { label: 'Профіль', href: '/profile' },
  { label: 'Правила', href: '/rules' }
];

export default function SiteChrome({ activeHref }: Props) {
  const logo = (
    <span style={{ display: 'block', width: 112, height: 32 }}>
      <NeonLogo
        text="ТУСОВКА"
        fontFamily="system-ui, sans-serif"
        fontWeight={800}
        scale={1}
        baseColor="#fff4fb"
        colors={['#ff2d87', '#10e0ff', '#b45cff']}
        heat={0.72}
        radius={1.1}
        softness={0.22}
        swell={0.06}
        idle="lit"
        speed={1.2}
        intro
        igniteOnClick
      />
    </span>
  );

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-5">
      <div className="pointer-events-auto mx-auto max-w-5xl">
        <PillNav
          logo={logo}
          logoAlt="Тусовка — на головну"
          logoHref="/"
          items={LINKS}
          activeHref={activeHref}
          theme="dark"
          layout="split"
          size="sm"
          surface="glass"
          itemStyle="pill"
          hoverEffect="glide"
          indicator="dot"
          highlightColor="#ff2d87"
          highlightTextColor="#07020f"
          textColor="#f5d9ff"
          barColor="rgba(20, 10, 38, 0.82)"
          collapse="auto"
          intro
          ariaLabel="Головна навігація"
          className="whitespace-nowrap"
        />
      </div>
    </header>
  );
}
