'use client';

import HoloMosaic from '../HoloMosaic';
import SpecularButton from '../SpecularButton';
import SplitText from '../SplitText';
import ShinyText from '../ShinyText';

export default function PromoStrip({ href }: { href: string }) {
  return (
    <section className="relative h-44 overflow-hidden rounded-2xl border border-[var(--vc-cyan)]/30" aria-label="Створити подію">
      <HoloMosaic
        spectrum="warm"
        tileSize={1.8}
        gap={0.14}
        roundness={0.26}
        bevel={0.5}
        swirl={1.1}
        ripple={0.5}
        intensity={0.95}
        saturation={0.5}
        glitter={0.5}
        speed={0.4}
        opacity={0.6}
        fade={0.5}
        intro
        mouseInteraction
        flipOnClick
      />
      <div className="pointer-events-none absolute inset-0 flex items-center bg-gradient-to-r from-[#07020f]/90 via-[#07020f]/45 to-transparent p-6">
        <div className="pointer-events-auto flex flex-col gap-2">
          <ShinyText
            text="Після заходу · новий сезон"
            color="#10e0ff"
            shineColor="#ff2d87"
            speed={2.6}
            trigger="loop"
            className="text-[11px] uppercase tracking-[0.2em]"
          />
          <SplitText
            text="Збери своїх. Запали місто."
            tag="h2"
            splitType="words"
            effect="rise"
            duration={0.8}
            trigger="load"
            textAlign="left"
            color="#fdf4ff"
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          />
          <SpecularButton
            type="button"
            size="sm"
            tint="#ff2d87"
            textColor="#07020f"
            radius={10}
            onClick={() => { window.location.href = href; }}
          >
            Створити подію →
          </SpecularButton>
        </div>
      </div>
    </section>
  );
}
