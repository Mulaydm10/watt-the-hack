// Approximate centre of a 2-digit German postcode area. Leads only store the area (e.g. "82xxx"), never an address,
// so the map shows "approximate area", not where someone lives.
const AREA: Record<string, [number, number, string]> = {
  '80': [48.137, 11.575, 'München'], '81': [48.115, 11.62, 'München Ost'], '82': [48.03, 11.36, 'Starnberg / Fürstenfeldbruck'],
  '83': [47.86, 12.12, 'Rosenheim'], '84': [48.54, 12.15, 'Landshut'], '85': [48.4, 11.68, 'Freising / Dachau'],
  '86': [48.37, 10.9, 'Augsburg'], '93': [49.01, 12.1, 'Regensburg'], '94': [48.57, 13.43, 'Passau'],
  '20': [53.55, 10.0, 'Hamburg'], '21': [53.42, 10.12, 'Hamburg Süd / Lüneburg'], '22': [53.6, 10.05, 'Hamburg Nord'],
};
const GERMANY: [number, number] = [51.16, 10.45];

/** [lat, lon, label] for an area like "82xxx"; small deterministic jitter so several leads in one area don't overlap. */
export function areaPoint(area: string | null | undefined, seed: string): { lat: number; lon: number; label: string; known: boolean } {
  const key = (area ?? '').slice(0, 2);
  const hit = AREA[key];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const jx = ((h % 1000) / 1000 - 0.5) * 0.12;
  const jy = (((h >> 10) % 1000) / 1000 - 0.5) * 0.08;
  if (!hit) return { lat: GERMANY[0] + jy, lon: GERMANY[1] + jx, label: 'Unknown area', known: false };
  return { lat: hit[0] + jy, lon: hit[1] + jx, label: hit[2], known: true };
}
