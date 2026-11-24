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
          color="#8a8f98"
          shineColor="#c9caff"
          speed={2.6}
          angle={-18}
          shineWidth={2.2}
          softness={0.6}
          bands={2}
          glow={0.35}
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
        color="#f7f8f8"
        accentColor="#8b8cff"
        hoverEffect="lift"
        className="hero-title text-4xl font-medium tracking-tight sm:text-5xl"
      />
      <p className="text-sm text-muted-foreground">
        <DecryptedText
          text={subtitle}
          speed={28}
          maxIterations={10}
          sequential
          revealDirection="start"
          animateOn="view"
          effect="scramble"
          scrambleColor="#7170ff"
          useOriginalCharsOnly={false}
          characters="АБВГДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ0123456789±§@#$%"
          parentClassName="inline"
        />
      </p>
    </div>
  );
}
