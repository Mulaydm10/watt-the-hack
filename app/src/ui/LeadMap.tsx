import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { areaPoint } from './areaCoords';
import { VERDICT_COLOR, type Verdict } from './hearth';

export type MapLead = { id: string; area: string | null; verdict: Verdict; label: string };

/** Dark map of all leads at their postcode-area centre. Selecting a lead flies to it and pulses its marker. */
export function LeadMap({ leads, selected, onSelect }: { leads: MapLead[]; selected: string | null; onSelect: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef<Record<string, L.CircleMarker>>({});

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false }).setView([50.5, 11], 6);
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    // OpenStreetMap tiles (no key); darkened and warmed to Hearth with a CSS filter on the tile pane.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, className: 'hpr-tiles',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  // (Re)draw markers when leads change.
  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    markers.current = {};
    const pts: L.LatLngExpression[] = [];
    for (const l of leads) {
      const p = areaPoint(l.area, l.id);
      const c = VERDICT_COLOR[l.verdict];
      const m = L.circleMarker([p.lat, p.lon], { radius: 9, color: c.core, weight: 2, fillColor: c.core, fillOpacity: 0.55 })
        .bindTooltip(`<b>${l.id}</b><br>${l.label}<br><span style="opacity:.7">${p.label} · ${l.area ?? '?'} · approximate area, not the address</span>`, { direction: 'top', offset: [0, -8], className: 'hpr-tip' })
        .on('click', () => onSelect(l.id));
      m.addTo(layer.current);
      markers.current[l.id] = m;
      pts.push([p.lat, p.lon]);
    }
    if (pts.length && !selected) map.current.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 8 });
  }, [leads, onSelect, selected]);

  // Fly to the selected lead.
  useEffect(() => {
    if (!map.current) return;
    Object.entries(markers.current).forEach(([id, m]) => m.setStyle({ radius: id === selected ? 14 : 9, weight: id === selected ? 4 : 2, fillOpacity: id === selected ? 0.9 : 0.55 }));
    if (!selected) return;
    const m = markers.current[selected];
    if (m) { map.current.flyTo(m.getLatLng(), 10, { duration: 1.2 }); m.openTooltip(); }
  }, [selected, leads]);

  return <div ref={el} className="hpr-map h-full min-h-[380px] w-full overflow-hidden rounded-2xl border border-[var(--line)]" aria-label="Map of leads by postcode area" />;
}
