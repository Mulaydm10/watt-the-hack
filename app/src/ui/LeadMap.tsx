import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { areaPoint } from './areaCoords';
import { VERDICT_COLOR, type Verdict } from './hearth';

/** OSM display names are long ("Rathaus, 2-6, Konrad-Adenauer-Straße, …, Deutschland"): keep name/number/street/town. */
const shortAddress = (d: string) => {
  const parts = d.split(',').map((x) => x.trim());
  const pc = parts.findIndex((x) => /^\d{5}$/.test(x));
  const town = pc > 0 ? parts[pc - 3] ?? parts[pc - 1] : parts[parts.length - 3];
  return [parts.slice(0, 3).join(' '), town].filter(Boolean).join(', ');
};

export type MapLead = {
  id: string; area: string | null; verdict: Verdict; label: string;
  /** Geocoded house address, only when the customer agreed to be contacted and gave it. */
  exact?: { lat: number; lon: number; display: string } | null;
};

/**
 * Dark map of all leads. Exact pins for leads with a consented address (fly to street level on click);
 * otherwise a marker at the postcode-area centre with a soft "approximate area" circle.
 */
export function LeadMap({ leads, selected, onSelect }: { leads: MapLead[]; selected: string | null; onSelect: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef<Record<string, { m: L.CircleMarker; exact: boolean }>>({});

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false }).setView([50.5, 11], 6);
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    // OpenStreetMap tiles (no key); darkened and warmed to Hearth with a CSS filter on the tile pane.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, className: 'hpr-tiles',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    markers.current = {};
    const pts: L.LatLngExpression[] = [];
    for (const l of leads) {
      const c = VERDICT_COLOR[l.verdict];
      const area = areaPoint(l.area, l.id);
      const exact = l.exact ?? null;
      const at: L.LatLngExpression = exact ? [exact.lat, exact.lon] : [area.lat, area.lon];
      if (!exact) L.circle(at, { radius: 4500, color: c.core, weight: 1, opacity: 0.35, fillColor: c.core, fillOpacity: 0.06, dashArray: '4 6', interactive: false }).addTo(layer.current);
      const where = exact
        ? `${shortAddress(exact.display)}<br><span style="opacity:.7">exact address · shared with consent</span>`
        : `${area.label} · ${l.area ?? '?'}<br><span style="opacity:.7">approximate area, not the address</span>`;
      const m = L.circleMarker(at, { radius: exact ? 8 : 9, color: exact ? 'oklch(0.97 0.02 90)' : c.core, weight: 2, fillColor: c.core, fillOpacity: exact ? 0.95 : 0.55 })
        .bindTooltip(`<b>${l.id}</b><br>${l.label}<br>${where}`, { direction: 'top', offset: [0, -8], className: 'hpr-tip' })
        .on('click', () => onSelect(l.id));
      m.addTo(layer.current);
      markers.current[l.id] = { m, exact: Boolean(exact) };
      pts.push(at);
    }
    if (pts.length && !selected) map.current.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 9 });
  }, [leads, onSelect, selected]);

  useEffect(() => {
    if (!map.current) return;
    Object.entries(markers.current).forEach(([id, { m, exact }]) => m.setStyle({ radius: id === selected ? (exact ? 12 : 14) : exact ? 8 : 9, weight: id === selected ? 4 : 2 }));
    if (!selected) return;
    const hit = markers.current[selected];
    // Exact address → street level, the building is visible; area only → regional zoom.
    if (hit) { map.current.flyTo(hit.m.getLatLng(), hit.exact ? 18 : 11, { duration: 1.4 }); hit.m.openTooltip(); }
  }, [selected, leads]);

  return <div ref={el} className="hpr-map h-full min-h-[380px] w-full overflow-hidden rounded-2xl border border-[var(--line)]" aria-label="Map of leads" />;
}
