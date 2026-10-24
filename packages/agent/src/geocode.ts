// Address → coordinates for the sales map. Only used for leads where the customer agreed to be contacted and gave
// the address; the result is stored only in the token-protected lead. Uses OpenStreetMap Nominatim (no key):
// at most 1 request/second and an identifying User-Agent, per its usage policy. Customers' addresses are sent to
// this third-party service, which the privacy text must say.
export type GeoPoint = { lat: number; lon: number; display: string; precision: 'building' | 'street' | 'area' };

let last = 0;
const UA = process.env.GEOCODER_USER_AGENT ?? 'nuuEnergy-heatpump-ready/0.1 (hackathon demo)';

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const q = address.trim();
  if (q.length < 6) return null;
  const wait = 1100 - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=de&addressdetails=0&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'de' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const [hit] = (await r.json()) as { lat: string; lon: string; display_name: string; addresstype?: string; type?: string }[];
    if (!hit) return null;
    const kind = hit.addresstype ?? hit.type ?? '';
    const precision = /house|building|amenity|office|townhall|place_of_worship/.test(kind) ? 'building' : /road|street|residential/.test(kind) ? 'street' : 'area';
    return { lat: Number(hit.lat), lon: Number(hit.lon), display: hit.display_name, precision };
  } catch {
    return null;
  }
}
