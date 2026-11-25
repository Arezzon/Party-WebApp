'use client';

import SplitText from '../SplitText';
import ShinyText from '../ShinyText';

interface Props {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  center?: boolean;
}

/** Text-only hero. No layout tricks, no decorative wrappers around the copy. */
export default function SiteHeading({ title, subtitle = '', eyebrow = '', center = false }: Props) {
  return (
    <div className={`flex flex-col gap-2 ${center ? 'items-center text-center' : ''}`}>
      {eyebrow ? (
        <ShinyText
          text={eyebrow}
          color="#10e0ff"
          shineColor="#ff2d87"
          speed={2.4}
          angle={-18}
          shineWidth={2}
          softness={0.6}
          bands={2}
          glow={0.45}
          trigger="loop"
          className="text-[11px] font-medium uppercase tracking-[0.22em]"
        />
      ) : null}

      <SplitText
        text={title}
        tag="h1"
        splitType="words"
        effect="blur"
        duration={0.9}
        delay={26}
        ease="power3.out"
        staggerFrom="start"
        trigger="load"
        textAlign={center ? 'center' : 'left'}
        color="#fdf4ff"
        accentColor="#ff2d87"
        className="vc-neon-text text-3xl font-semibold tracking-tight sm:text-5xl"
      />

      {subtitle ? (
        <ShinyText
          text={subtitle}
          color="#a48bc4"
          shineColor="#10e0ff"
          speed={3}
          angle={-14}
          shineWidth={1.6}
          softness={0.55}
          bands={1}
          glow={0.2}
          trigger="loop"
          className="text-sm"
        />
      ) : null}
    </div>
  );
}
