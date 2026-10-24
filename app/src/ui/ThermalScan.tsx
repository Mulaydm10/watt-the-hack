import { useMemo, useState } from 'react';
import type { Building } from '@core/engine/types';

/**
 * Illustrative thermal pre-scan. NOT a measurement: hotspot strength is modelled
 * from the building facts (age, renovation, glazing notes, pipe system) so sales can
 * read a house at a glance. Label stays visible in the UI.
 */
type Leak = [x: number, y: number, size: number, intensity: number];

export function leaksFor(b: Building): { leaks: Leak[]; warm: number } {
  // Unknown year → neutral middle; illustrative only, never fed into scoring.
  const age = b.construction_year == null ? 0.5 : Math.max(0, Math.min(1, (2015 - b.construction_year) / 50));
  const notes = (b.building_notes ?? '').toLowerCase();
  const reno = b.renovation_status === 'fully' ? -0.3 : b.renovation_status === 'partially' ? -0.12 : 0;
  const roof = Math.max(0.12, age * 0.8 + reno + (notes.includes('no additional insulation') ? 0.35 : 0));
  const win = Math.max(0.12, age * 0.85 + reno + (notes.includes('without low-e') ? 0.2 : 0));
  const wall = Math.max(0.1, age * 0.7 + reno);
  const semi = notes.includes('semi-detached');
  return {
    warm: Math.min(0.7, 0.08 + age * 0.6 + reno),
    leaks: [[50, 22, 30 + roof * 25, roof], [30, 52, 22 + win * 12, win], [70, 52, 22 + win * 12, win * 0.95],
      [50, 84, 20 + wall * 10, wall], [semi ? 12 : 20, 80, 24, wall * 0.9], [semi ? 88 : 80, 80, semi ? 16 : 24, semi ? 0.15 : wall * 0.9]],
  };
}

export function ThermalScan({ b, scanKey }: { b: Building; scanKey: number }) {
  const { leaks, warm } = useMemo(() => leaksFor(b), [b]);
  const [cross, setCross] = useState<{ x: number; y: number; t: number } | null>(null);
  const maxT = 5 + warm * 4 + Math.max(...leaks.map((l) => l[3])) * 13;

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100;
    const rx = ((x - 16) / 62) * 100, ry = ((y - 10) / 78) * 100;
    const inside = rx >= 0 && rx <= 100 && ry >= 0 && ry <= 100 && (ry >= 38 || Math.abs(rx - 50) <= (ry / 38) * 50);
    let t = 1.8;
    if (inside) { t = 5 + warm * 4; for (const [bx, by, bs, bo] of leaks) t += bo * 13 * Math.exp(-((rx - bx) ** 2 + (ry - by) ** 2) / (bs * 0.55) ** 2); }
    setCross({ x, y, t });
  };

  return (
    <div onMouseMove={onMove} onMouseLeave={() => setCross(null)} role="img"
      aria-label={`Illustrative thermal pre-scan of ${b.building_id}, max surface ${maxT.toFixed(1)} °C`}
      className="relative aspect-[5/4] cursor-crosshair overflow-hidden rounded-md border border-[var(--line)]"
      style={{ background: 'radial-gradient(120% 90% at 50% 100%, oklch(0.24 0.08 290), oklch(0.15 0.04 280))' }}>
      <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(oklch(0.9 0.05 300 / .05) 1px, transparent 1px),linear-gradient(90deg, oklch(0.9 0.05 300 / .05) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      <div className="absolute" style={{ left: '16%', right: '22%', top: '10%', bottom: '12%', clipPath: 'polygon(50% 0, 100% 38%, 100% 100%, 0 100%, 0 38%)', background: 'linear-gradient(oklch(0.3 0.13 295), oklch(0.26 0.11 285))' }}>
        <div className="absolute inset-0 transition-opacity duration-[1200ms]" style={{ opacity: warm, background: 'radial-gradient(70% 70% at 50% 55%, oklch(0.5 0.2 350), transparent 75%)' }} />
        {leaks.map(([x, y, s, o], i) => (
          <div key={i} className="absolute rounded-full" style={{
            left: `${x}%`, top: `${y}%`, width: `${s}%`, aspectRatio: '1', opacity: o, mixBlendMode: 'screen', filter: 'blur(4px)',
            background: 'radial-gradient(circle, oklch(0.98 0.06 100) 0%, oklch(0.88 0.17 88) 16%, oklch(0.72 0.2 50) 36%, oklch(0.55 0.22 15) 56%, oklch(0.45 0.2 340 / 0) 74%)',
            transition: 'left 1.2s cubic-bezier(.6,0,.2,1), top 1.2s cubic-bezier(.6,0,.2,1), width 1.2s cubic-bezier(.6,0,.2,1), opacity 1.2s',
            animation: `hpr-breathe ${4 + i * 0.7}s ease-in-out infinite`,
          }} />
        ))}
        <div className="absolute border border-[oklch(0.96_0.04_90/.22)]" style={{ left: '16%', top: '44%', width: '20%', height: '17%' }} />
        <div className="absolute border border-[oklch(0.96_0.04_90/.22)]" style={{ right: '16%', top: '44%', width: '20%', height: '17%' }} />
        <div className="absolute border border-b-0 border-[oklch(0.96_0.04_90/.22)]" style={{ left: '43%', bottom: 0, width: '14%', height: '24%' }} />
        <div key={scanKey} className="absolute inset-x-0" style={{ height: '14%', background: 'linear-gradient(transparent, oklch(0.95 0.1 90 / .35), transparent)', animation: 'hpr-scan 2.2s cubic-bezier(.4,0,.2,1) both' }} />
      </div>
      <div className="absolute h-px bg-[oklch(0.9_0.05_300/.25)]" style={{ left: '6%', right: '6%', bottom: '12%' }} />
      <div className="absolute w-2.5 rounded-sm" style={{ right: '6%', top: '12%', bottom: '14%', background: 'linear-gradient(to top, oklch(0.26 0.11 285), oklch(0.45 0.2 340), oklch(0.6 0.22 20), oklch(0.76 0.18 55), oklch(0.9 0.15 92), oklch(0.98 0.05 100))' }} />
      <span className="font-mono-h absolute text-[11px] text-[var(--ink)]" style={{ right: 'calc(6% + 16px)', top: '11%' }}>22°</span>
      <span className="font-mono-h absolute text-[11px] text-[var(--ink)]" style={{ right: 'calc(6% + 16px)', bottom: '13%' }}>0°</span>
      <div className="font-mono-h absolute left-4 top-3.5 text-[11px] leading-relaxed text-[var(--ink)]">
        IR · {b.building_id} · {b.construction_year} · ε 0.95<br />
        <span className="text-[var(--amber-soft)]">max surface {maxT.toFixed(1)} °C</span>
      </div>
      {cross && (<>
        <div className="pointer-events-none absolute inset-y-0 w-px bg-[oklch(0.98_0.02_90/.45)]" style={{ left: `${cross.x}%` }} />
        <div className="pointer-events-none absolute inset-x-0 h-px bg-[oklch(0.98_0.02_90/.45)]" style={{ top: `${cross.y}%` }} />
        <div className="font-mono-h pointer-events-none absolute whitespace-nowrap border border-[oklch(0.98_0.02_90/.4)] bg-[oklch(0.15_0.03_280/.85)] px-2 py-1 text-xs text-[oklch(0.98_0.02_90)]"
          style={{ left: `${cross.x}%`, top: `${cross.y}%`, transform: 'translate(10px,-34px)' }}>{cross.t.toFixed(1)} °C</div>
      </>)}
    </div>
  );
}
