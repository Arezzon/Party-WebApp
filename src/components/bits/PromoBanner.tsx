'use client';

import SpotlightCard from '../SpotlightCard';
import ShinyText from '../ShinyText';
import SplitText from '../SplitText';
import SpecularButton from '../SpecularButton';
import HoloMosaic from '../HoloMosaic';

interface Props {
  href: string;
}

export default function PromoBanner({ href }: Props) {
  return (
    <section className="relative h-44 overflow-hidden rounded-xl border border-border" aria-label="Рекламний блок">
      <HoloMosaic
        spectrum="warm"
        tileSize={1.7}
        gap={0.12}
        roundness={0.24}
        bevel={0.55}
        swirl={1.2}
        ripple={0.5}
        intensity={1}
        saturation={0.55}
        glitter={0.55}
        speed={0.45}
        opacity={0.6}
        fade={0.5}
        intro
        mouseInteraction
        flipOnClick
      />
      <div className="pointer-events-none absolute inset-0 flex items-center bg-gradient-to-r from-background/85 via-background/35 to-transparent p-6">
        <SpotlightCard
          spotlightColor="rgba(255,46,136,0.4)"
          intensity={0.8}
          shape="beam"
          borderGlow={0.6}
          theme="dark"
          className="pointer-events-auto max-w-lg border-0 bg-transparent p-0"
        >
          <div className="flex flex-col gap-2">
            <ShinyText
              text="Vice City · новий сезон"
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
            <SplitText
              text="Події, що горять неоном"
              tag="h2"
              splitType="words"
              effect="rise"
              duration={0.8}
              trigger="load"
              textAlign="left"
              color="#fff5fb"
              className="text-2xl font-medium tracking-tight"
            />
            <SpecularButton
              size="sm"
              tint="#ff2e88"
              textColor="#0a0418"
              radius={10}
              speed={1.4}
              onClick={() => {
                window.location.href = href;
              }}
            >
              Створити подію →
            </SpecularButton>
          </div>
        </SpotlightCard>
      </div>
    </section>
  );
}
