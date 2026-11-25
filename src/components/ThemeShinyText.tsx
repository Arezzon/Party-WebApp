'use client';

import { useSyncExternalStore } from 'react';
import ShinyText from './ShinyText';
import type { ShinyTextProps } from './ShinyText';

const PALETTE = {
  dark: { color: '#b5b5b5', shineColor: '#ffffff' },
  light: { color: '#4a4a4a', shineColor: '#0a0a0a' }
} as const;

function subscribe(onStoreChange: () => void) {
  if (typeof document === 'undefined') return () => {};
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

const isLight = () => typeof document !== 'undefined' && !document.documentElement.classList.contains('dark');
const serverSnapshot = () => false;

/**
 * Adapter for the literal-color ShinyText registry component: keeps the exact
 * requested dark palette and mirrors it in light mode without a hydration mismatch.
 */
export default function ThemeShinyText(props: ShinyTextProps) {
  const light = useSyncExternalStore(subscribe, isLight, serverSnapshot);
  const palette = light ? PALETTE.light : PALETTE.dark;
  return <ShinyText {...props} color={palette.color} shineColor={palette.shineColor} />;
}
