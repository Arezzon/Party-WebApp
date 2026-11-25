'use client';

import SplitText from '../SplitText';
import DecryptedText from '../DecryptedText';
import ShinyText from '../ShinyText';

interface Props {
  title: string;
  subtitle: string;
  eyebrow?: string;
}

export default function HeroText({ title, subtitle, eyebrow }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {eyebrow ? (
        <ShinyText
          text={eyebrow}
          color="#00e5ff"
          shineColor="#ff2e88"
          speed={2.6}
          angle={-18}
          shineWidth={2.2}
          softness={0.6}
          bands={2}
          glow={0.5}
          trigger="loop"
          easing="smooth"
          className="text-[11px] uppercase tracking-[0.18em]"
        />
      ) : null}
      <SplitText
        text={title}
        tag="h1"
        splitType="chars"
        effect="blur"
        delay={38}
        duration={1.1}
        ease="power3.out"
        staggerFrom="center"
        textAlign="left"
        trigger="load"
        color="#fff5fb"
        accentColor="#ff2e88"
        hoverEffect="lift"
        className="hero-title text-4xl font-medium tracking-tight sm:text-5xl"
      />
      <p className="text-sm text-muted-foreground">
        <DecryptedText
          text={subtitle}
          speed={16}
          maxIterations={64}
          sequential
          revealDirection="start"
          animateOn="view"
          effect="scramble"
          scrambleColor="#00e5ff"
          useOriginalCharsOnly={false}
          characters="АБВГДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ0123456789±§@#$%"
          parentClassName="inline"
        />
      </p>
    </div>
  );
}
