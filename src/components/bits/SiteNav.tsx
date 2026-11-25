'use client';

import PillNav from '../PillNav';
import NeonLogo from '../NeonLogo';

interface NavLink {
  label: string;
  href: string;
}

interface Props {
  activeHref: string;
  links: NavLink[];
}

export default function SiteNav({ activeHref, links }: Props) {
  const logo = (
    <span style={{ display: 'block', width: 104, height: 28 }}>
      <NeonLogo
        text="Тусовка"
        fontFamily="system-ui, sans-serif"
        fontWeight={700}
        scale={0.95}
        baseColor="#fff5fb"
        colors={['#ff2e88', '#00e5ff', '#b967ff']}
        heat={0.65}
        radius={1.1}
        softness={0.2}
        swell={0.05}
        idle="lit"
        speed={1.1}
        intro
        igniteOnClick
      />
    </span>
  );

  return (
    <PillNav
      logo={logo}
      logoAlt="Тусовка — на головну"
      logoHref="/"
      items={links.map((link) => ({ label: link.label, href: link.href }))}
      activeHref={activeHref}
      theme="dark"
      layout="split"
      size="sm"
      surface="glass"
      itemStyle="pill"
      hoverEffect="glide"
      indicator="dot"
      highlightColor="#ff2e88"
      highlightTextColor="#0a0418"
      textColor="#f3d9ff"
      collapse="auto"
      intro
      ariaLabel="Головна навігація"
    />
  );
}
