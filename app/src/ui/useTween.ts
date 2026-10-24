import { useEffect, useRef, useState } from 'react';

/** Eases a displayed number toward its target (count-up on load, smooth re-decide on slider drag). */
export function useTween(target: number, k = 0.13) {
  const [v, setV] = useState(0);
  const cur = useRef(0);
  useEffect(() => {
    let raf = 0;
    const step = () => {
      const d = target - cur.current;
      if (Math.abs(d) < 0.4) { cur.current = target; setV(target); return; }
      cur.current += d * k; setV(cur.current); raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, k]);
  return v;
}
