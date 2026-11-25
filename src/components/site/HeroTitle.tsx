'use client';

import { useEffect, useState } from 'react';
import ShinyText from '../ShinyText';

/** Hero headline with React Bits ShinyText, theme-aware without dark inline colors. */
export default function HeroTitle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    setDark(root.classList.contains('dark'));
    const observer = new MutationObserver(() => setDark(root.classList.contains('dark')));
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return (
    <h1 className="display mt-5 max-w-[15ch] text-[clamp(2.6rem,6.2vw,4.6rem)]">
      <ShinyText
        text="Знайди своїх."
        color={dark ? '#fafafa' : '#0a0a0a'}
        shineColor={dark ? '#8ab4ff' : '#ffffff'}
        speed={3}
        delay={1.2}
        angle={115}
        shineWidth={18}
        softness={0.75}
        bands={1}
        glow={0}
        direction="right"
        easing="smooth"
        trigger="loop"
        pauseOnHover
      />
      <br />
      <span className="serif">після заходу.</span>
    </h1>
  );
}
