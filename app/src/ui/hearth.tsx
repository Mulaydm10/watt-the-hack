import type { CSSProperties, ReactNode } from 'react';
import { useTween } from './useTween';

// Shared Hearth pieces: one visual language for the homeowner pages, the result and Live leads.

export const VERDICT_COLOR = {
  green: { core: 'oklch(0.86 0.17 150)', glow: 'oklch(0.72 0.17 150 / .55)', haze: 'oklch(0.6 0.15 150 / .18)', word: 'Green', de: 'Grün' },
  yellow: { core: 'oklch(0.9 0.16 88)', glow: 'oklch(0.8 0.16 80 / .55)', haze: 'oklch(0.7 0.15 70 / .2)', word: 'Yellow', de: 'Gelb' },
  red: { core: 'oklch(0.75 0.2 28)', glow: 'oklch(0.66 0.2 25 / .55)', haze: 'oklch(0.55 0.18 25 / .2)', word: 'Red', de: 'Rot' },
} as const;
export type Verdict = keyof typeof VERDICT_COLOR;

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`font-mono-h text-[11px] uppercase tracking-[0.12em] text-[var(--sand)] ${className}`}>{children}</div>;
}

/** The verdict as a glowing ember (colour + word, never colour alone). */
export function Ember({ verdict, size = 132, label = true }: { verdict: Verdict; size?: number; label?: boolean }) {
  const c = VERDICT_COLOR[verdict];
  return (
    <div className="flex flex-col items-center gap-3">
      <div role="img" aria-label={`Traffic light: ${c.word}`} className="hpr-ember relative"
        style={{ width: size, height: size, ['--ember-glow' as string]: c.glow, ['--ember-haze' as string]: c.haze,
          background: `radial-gradient(circle at 38% 34%, oklch(0.99 0.03 95) 0%, ${c.core} 28%, ${c.glow} 62%, transparent 72%)` } as CSSProperties} />
      {label && <span className="font-mono-h text-xs uppercase tracking-[0.2em]" style={{ color: c.core }}>{c.word}</span>}
    </div>
  );
}

/** A number that counts up on first render and eases to new values. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-US'), className = '' }: { value: number; format?: (n: number) => string; className?: string }) {
  const v = useTween(value);
  return <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>{format(v)}</span>;
}

export function HeatField() {
  return <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden"><div className="hpr-heatfield" /></div>;
}

/** Full-bleed stage that breaks out of the centred page column. */
export function Stage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`relative -mx-4 -my-8 min-h-screen overflow-hidden px-[clamp(20px,4vw,56px)] pb-16 text-[var(--ink)] ${className}`}>{children}</div>;
}

export const STATUS_GLYPH = { good: ['✓', 'oklch(0.86 0.13 150)'], check: ['?', 'oklch(0.88 0.13 85)'], issue: ['!', 'oklch(0.78 0.16 30)'] } as const;
