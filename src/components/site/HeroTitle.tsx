'use client';

import ShinyText from '../ShinyText';

/** Hero headline with the exact ShinyText palette requested for the design. */
export default function HeroTitle() {
  return (
    <h1 className="display mt-5 max-w-[15ch] text-[clamp(2.6rem,6.2vw,4.6rem)]">
      <ShinyText
        text="Знайди своїх."
        color="#b5b5b5"
        shineColor="#ffffff"
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
