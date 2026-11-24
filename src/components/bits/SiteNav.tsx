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
        baseColor="#e6e8ee"
        colors={['#5e6ad2', '#7170ff', '#9b8cff']}
        heat={0.4}
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
      highlightColor="#7170ff"
      highlightTextColor="#ffffff"
      textColor="#c7ccd8"
      collapse="auto"
      intro
      ariaLabel="Головна навігація"
    />
  );
}
