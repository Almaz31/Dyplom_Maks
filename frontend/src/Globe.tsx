import { useEffect, useMemo, useRef, useState } from "react";
import {
  geoContains,
  geoDistance,
  geoGraticule10,
  geoOrthographic,
  geoPath,
  type GeoProjection,
} from "d3-geo";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { fieldTexture, projectField, type GlobeField } from "./globeField";
type Land = FeatureCollection<Polygon | MultiPolygon>;
type Countries = FeatureCollection<
  Polygon | MultiPolygon,
  { id: string; name: string; iso2: string }
>;
export type SelectedCountry = { id: string; name: string; iso2: string };
const graticule = geoGraticule10();
export type GlobeMarker = {
  id: string;
  lat: number;
  lon: number;
  label: string;
  color?: string;
  valueLabel?: string;
};
export default function Globe({
  markers = [],
  onSelect,
  onMarkerSelect,
  focus,
  onCountryChange,
  field,
}: {
  field?: GlobeField;
  markers?: GlobeMarker[];
  onSelect?: (lat: number, lon: number) => void;
  onMarkerSelect?: (id: string) => void;
  focus?: { lat: number; lon: number };
  onCountryChange?: (country: SelectedCountry | null) => void;
}) {
  const texture = useMemo(() => (field ? fieldTexture(field) : null), [field]);
  const canvas = useRef<HTMLCanvasElement>(null),
    rotation = useRef({ lon: 25, lat: 15, zoom: 1 }),
    drag = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false),
    projectionRef = useRef<GeoProjection | null>(null),
    hits = useRef<
      { id: string; x: number; y: number; lat: number; lon: number }[]
    >([]);
  const [countries, setCountries] = useState<Countries | null>(null),
    [countryError, setCountryError] = useState(false),
    [selectedPoint, setSelectedPoint] = useState<{
      lat: number;
      lon: number;
    } | null>(focus || null);
  const selectedCountry = useMemo(
    () =>
      selectedPoint
        ? countries?.features.find((f) =>
            geoContains(f, [selectedPoint.lon, selectedPoint.lat]),
          )
        : undefined,
    [countries, selectedPoint],
  );
  useEffect(() => {
    if (countries) onCountryChange?.(selectedCountry?.properties || null);
  }, [countries, selectedCountry, onCountryChange]);
  useEffect(() => {
    const c = new AbortController();
    fetch("/world-countries.geojson", { signal: c.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setCountries)
      .catch((e) => {
        if (e.name !== "AbortError") setCountryError(true);
      });
    return () => c.abort();
  }, []);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    // React's delegated wheel handler is passive; use a local listener so zoom
    // can cancel page scrolling, including when the zoom limit is reached.
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta =
        e.deltaY *
        (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1);
      rotation.current.zoom = Math.max(
        0.7,
        Math.min(1.25, rotation.current.zoom - delta * 0.001),
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    if (focus) {
      rotation.current.lon = focus.lon;
      rotation.current.lat = focus.lat;
      setSelectedPoint(focus);
    }
  }, [focus?.lat, focus?.lon]);
  const [land, setLand] = useState<Land | null>(null),
    [error, setError] = useState(""),
    [auto, setAuto] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    fetch("/world-land.geojson", { signal: c.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setLand)
      .catch((e) => {
        if (e.name !== "AbortError")
          setError("Не вдалося завантажити контури материків.");
      });
    return () => c.abort();
  }, []);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    let id = 0;
    let projected: HTMLCanvasElement | null = null,
      projectionKey = "";
    const draw = () => {
      const w = el.clientWidth,
        h = el.clientHeight,
        dpr = window.devicePixelRatio || 1;
      if (el.width !== w * dpr || el.height !== h * dpr) {
        el.width = w * dpr;
        el.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (auto && !drag.current) rotation.current.lon += 0.12;
      const { lon, lat, zoom } = rotation.current,
        r = Math.min(w * 0.43, h * 0.43) * zoom,
        cx = w / 2,
        cy = h / 2;
      const projection = geoOrthographic()
        .rotate([-lon, -lat])
        .translate([cx, cy])
        .scale(r)
        .clipAngle(90)
        .precision(0.3);
      projectionRef.current = projection;
      const path = geoPath(projection, ctx);
      const glow = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.13);
      glow.addColorStop(0, "#70d5cd55");
      glow.addColorStop(1, "#70d5cd00");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      const sea = ctx.createRadialGradient(
        cx - r * 0.4,
        cy - r * 0.4,
        r * 0.05,
        cx,
        cy,
        r,
      );
      sea.addColorStop(0, "#2c6574");
      sea.addColorStop(1, "#092a3b");
      ctx.fillStyle = sea;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#8cc3c326";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      path(graticule);
      ctx.stroke();
      // Spherical clipping joins horizon intersections along the rim, rather than
      // closing partially visible rings with straight lines across the ocean.
      ctx.fillStyle = "#6d9b85";
      ctx.strokeStyle = "#a7c5a4";
      ctx.lineWidth = 0.7;
      if (land) {
        ctx.beginPath();
        path(land);
        ctx.fill();
        ctx.stroke();
      }
      if (texture) {
        const size = Math.min(512, Math.max(240, Math.ceil(r * 2)));
        const key = `${lon}:${lat}:${size}`;
        if (!projected || projectionKey !== key) {
          projected = projectField(texture, lon, lat, size);
          projectionKey = key;
        }
        ctx.drawImage(projected, cx - r, cy - r, r * 2, r * 2);
      }
      if (selectedCountry && !texture) {
        ctx.beginPath();
        path(selectedCountry);
        ctx.fillStyle = "#c5a46b";
        ctx.fill();
      }
      const shade = ctx.createRadialGradient(
        cx - r * 0.35,
        cy - r * 0.35,
        r * 0.1,
        cx + r * 0.15,
        cy + r * 0.1,
        r * 1.1,
      );
      shade.addColorStop(0, "#00000000");
      shade.addColorStop(0.6, "#00000008");
      shade.addColorStop(1, texture ? "#00000035" : "#000000bb");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, w, h);
      if (countries) {
        ctx.beginPath();
        path(countries);
        ctx.strokeStyle = "#d5e9cd99";
        ctx.lineWidth = 0.65;
        ctx.stroke();
      }
      if (selectedCountry) {
        ctx.beginPath();
        path(selectedCountry);
        ctx.strokeStyle = "#ffdb8f";
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
      hits.current = [];
      for (const marker of markers) {
        if (geoDistance([lon, lat], [marker.lon, marker.lat]) >= Math.PI / 2)
          continue;
        const p = projection([marker.lon, marker.lat]);
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(
          p[0],
          p[1],
          texture ? 3 : markers.length > 1000 ? 2.5 : 5,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = marker.color || "#efb66f";
        ctx.fill();
        ctx.strokeStyle = "#fff9";
        ctx.lineWidth = 0.7;
        ctx.stroke();
        hits.current.push({
          id: marker.id,
          x: p[0],
          y: p[1],
          lat: marker.lat,
          lon: marker.lon,
        });
        if (marker.valueLabel) {
          ctx.font = "14px system-ui";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#092a3b";
          ctx.strokeText(marker.valueLabel, p[0] + 9, p[1] + 4);
          ctx.fillStyle = "#f1f6ee";
          ctx.fillText(marker.valueLabel, p[0] + 9, p[1] + 4);
        }
      }
      ctx.restore();
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(id);
  }, [land, auto, markers, countries, selectedCountry, texture]);
  return (
    <div
      className="globe-view"
      data-country={selectedCountry?.properties.id || ""}
      data-field={field?.metric || ""}
    >
      <canvas
        ref={canvas}
        aria-label="3D Земля: перетягніть для обертання, стрілки для повороту, + та − для масштабу"
        aria-description={markers
          .map((marker) => marker.valueLabel || marker.label)
          .join("; ")}
        tabIndex={0}
        onPointerDown={(e) => {
          moved.current = false;
          drag.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          if (
            Math.abs(e.clientX - drag.current.x) +
              Math.abs(e.clientY - drag.current.y) >
            2
          )
            moved.current = true;
          rotation.current.lon -= (e.clientX - drag.current.x) * 0.4;
          rotation.current.lat = Math.max(
            -85,
            Math.min(
              85,
              rotation.current.lat + (e.clientY - drag.current.y) * 0.4,
            ),
          );
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onClick={(e) => {
          if (moved.current) return;
          const rect = e.currentTarget.getBoundingClientRect(),
            x = e.clientX - rect.left,
            y = e.clientY - rect.top;
          const hit = hits.current
            .filter((h) => Math.hypot(h.x - x, h.y - y) < 12)
            .sort(
              (a, b) =>
                Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
            )[0];
          if (hit && onMarkerSelect) {
            setSelectedPoint({ lat: hit.lat, lon: hit.lon });
            onMarkerSelect(hit.id);
            return;
          }
          const projection = projectionRef.current;
          if (!projection) return;
          const [cx, cy] = projection.translate();
          if (Math.hypot(x - cx, y - cy) > projection.scale()) return;
          const point = projection.invert?.([x, y]);
          if (point) {
            setSelectedPoint({ lat: point[1], lon: point[0] });
            onSelect?.(point[1], point[0]);
          }
        }}
        onKeyDown={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "+",
              "-",
            ].includes(e.key)
          )
            e.preventDefault();
          if (e.key === "ArrowLeft") rotation.current.lon -= 10;
          if (e.key === "ArrowRight") rotation.current.lon += 10;
          if (e.key === "ArrowUp")
            rotation.current.lat = Math.min(85, rotation.current.lat + 10);
          if (e.key === "ArrowDown")
            rotation.current.lat = Math.max(-85, rotation.current.lat - 10);
          if (e.key === "+")
            rotation.current.zoom = Math.min(1.25, rotation.current.zoom + 0.1);
          if (e.key === "-")
            rotation.current.zoom = Math.max(0.7, rotation.current.zoom - 0.1);
        }}
      />
      {selectedPoint && (
        <div className="globe-country-badge" role="status">
          {countryError
            ? "Межі країн недоступні"
            : !countries
              ? "Визначаємо країну…"
              : selectedCountry?.properties.name || "Океан / поза межами країн"}
        </div>
      )}
      <div className="globe-caption">
        {error ||
          (onSelect
            ? "Клік — вибрати точку · перетягування — обертання"
            : onMarkerSelect
              ? "Клік на маркер — деталі · перетягування — обертання"
              : "Перетягніть, щоб обертати · коліщатко для масштабу")}
      </div>
      <div className="globe-controls">
        <button
          className="secondary"
          onClick={() => setAuto(!auto)}
          aria-pressed={auto}
        >
          {auto ? "Зупинити" : "Автообертання"}
        </button>
        <button
          className="secondary"
          onClick={() => (rotation.current = { lon: 25, lat: 15, zoom: 1 })}
        >
          Скинути вид
        </button>
      </div>
    </div>
  );
}
