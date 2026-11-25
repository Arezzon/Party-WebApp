'use client';

import Grainient from '../Grainient';
import Noise from '../Noise';

/** Full-screen Vice City atmosphere. Pure decoration — never intercepts input. */
export default function Background() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 vc-sky" />

      {/* Retro sun, deliberately clipped by the horizon. */}
      <div className="absolute left-1/2 top-[8vh] h-[300px] w-[300px] -translate-x-1/2 overflow-hidden sm:h-[380px] sm:w-[380px]">
        <div className="vc-sun absolute inset-0 rounded-full opacity-80" />
        <div className="vc-sun-stripes absolute inset-0" />
      </div>

      <div className="absolute inset-0">
        <Grainient
          colors={['#07020f', '#1b0830', '#6b1246', '#ff2d87', '#10e0ff']}
          type="radial"
          angle={38}
          bands={2}
          speed={0.34}
          flow={0.6}
          scale={1.1}
          softness={0.72}
          silk={0.8}
          grainAmount={0.12}
          grainSize={1.3}
          grainAnimated
          contrast={1.04}
          saturation={1.12}
          variation={0.38}
          interactive
          stir={0.45}
          clickSwirl
          intro
          dpr={1.4}
          style={{ opacity: 0.38 }}
        />
      </div>

      <div className="absolute inset-x-[-20%] bottom-[-10%] h-[52%] vc-grid opacity-70" />

      <Noise
        opacity={0.045}
        size={140}
        fps={12}
        contrast={128}
        dust={0.3}
        scratches={0}
        scanlines={0.1}
        flicker={0.1}
        fixed
        zIndex={0}
      />
    </div>
  );
}
