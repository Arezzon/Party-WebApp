'use client';

import GlitchText from './GlitchText';

interface Props {
  text: string;
}

export default function GlitchLabel({ text }: Props) {
  return (
    <GlitchText
      speed={0.9}
      enableShadows
      offset={2}
      shadowColors={['#ff2e88', '#00e5ff']}
      mode="rgb"
      intensity={0.45}
      trigger="hover"
      className="font-medium text-foreground"
    >
      {text}
    </GlitchText>
  );
}
