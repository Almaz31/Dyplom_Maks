import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api, format, type Metric } from "./api";
import Analytics, { ChartCard } from "./Analytics";
import Globe, { type SelectedCountry } from "./Globe";
import { WeatherLegend, weatherColor } from "./weatherPalette";
import type { GlobeField } from "./globeField";
export const worldMetrics: Record<Metric, { label: string; unit: string }> = {
  temperature: { label: "Температура", unit: "°C" },
  precipitation: { label: "Опади", unit: "мм" },
  humidity: { label: "Вологість", unit: "%" },
  wind: { label: "Вітер", unit: "м/с" },
};
const cities = [
  { name: "Київ", lat: 50.45, lon: 30.52 },
  { name: "Лондон", lat: 51.51, lon: -0.13 },
  { name: "Нью-Йорк", lat: 40.71, lon: -74.01 },
  { name: "Токіо", lat: 35.68, lon: 139.69 },
  { name: "Сідней", lat: -33.87, lon: 151.21 },
  { name: "Каїр", lat: 30.04, lon: 31.24 },
  { name: "Ріо-де-Жанейро", lat: -22.91, lon: -43.17 },
  { name: "Кейптаун", lat: -33.92, lon: 18.42 },
];
type Weather = {
  series: ({ date: string } & Record<Metric, number | null>)[];
  latitude: number;
  longitude: number;
  grid_latitude: number;
  grid_longitude: number;
  source: string;
  url: string;
};
type Reference = {
  points: {
    lat: number;
    lon: number;
    name: string;
    metrics: Record<Metric, number | null>;
  }[];
};
type WeatherGrid = {
  latitudes: number[];
  longitudes: number[];
  points: { metrics: Record<Metric, number | null> }[];
  source: string;
  step: number;
  start: string;
  end: string;
};
export default function WorldWeather({ metric }: { metric: Metric }) {
  const [point, setPoint] = useState(cities[0]),
    [start, setStart] = useState("2024-01-01"),
    [end, setEnd] = useState("2024-12-31"),
    [data, setData] = useState<Weather | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [country, setCountry] = useState<SelectedCountry | null>(null);
  const [reference, setReference] = useState<Reference>({ points: [] });
  const [grid, setGrid] = useState<WeatherGrid | null>(null),
    [gridLoading, setGridLoading] = useState(false),
    [gridError, setGridError] = useState(""),
    [retryGrid, setRetryGrid] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setGrid(null);
    setGridError("");
    setGridLoading(true);
    const timer = setTimeout(
      () =>
        api<WeatherGrid>(
          "/world/weather-grid?" + new URLSearchParams({ start, end }),
          { signal: controller.signal },
        )
          .then(setGrid)
          .catch((e) => {
            if (e.name !== "AbortError") setGridError(e.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setGridLoading(false);
          }),
      250,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [start, end, retryGrid]);
  useEffect(() => {
    const c = new AbortController();
    setReference({ points: [] });
    api<Reference>(
      "/world/weather-reference?" + new URLSearchParams({ start, end }),
      { signal: c.signal },
    )
      .then(setReference)
      .catch(() => {});
    return () => c.abort();
  }, [start, end]);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    setLoading(true);
    const t = setTimeout(
      () =>
        api<Weather>(
          "/world/weather?" +
            new URLSearchParams({
              latitude: String(point.lat),
              longitude: String(point.lon),
              start,
              end,
            }),
          { signal: c.signal },
        )
          .then(setData)
          .catch((e) => {
            if (e.name !== "AbortError") setError(e.message);
          })
          .finally(() => {
            if (!c.signal.aborted) setLoading(false);
          }),
      200,
    );
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [point.lat, point.lon, start, end]);
  const rows = useMemo(
    () => data?.series.map((r) => ({ date: r.date, value: r[metric] })) || [],
    [data, metric],
  );
  const values = rows.filter(
      (r): r is { date: string; value: number } => r.value != null,
    ),
    sum = values.reduce((s, r) => s + r.value, 0),
    mean = values.length ? sum / values.length : null;
  const monthly = useMemo(() => {
    const groups = new Map<string, number[]>();
    rows.forEach((r) => {
      const key = r.date.slice(0, 7);
      if (!groups.has(key)) groups.set(key, []);
      if (r.value != null) groups.get(key)!.push(r.value);
    });
    return [...groups].map(([month, v]) => ({
      month,
      value: v.length
        ? metric === "precipitation"
          ? v.reduce((a, b) => a + b, 0)
          : v.reduce((a, b) => a + b, 0) / v.length
        : null,
    }));
  }, [rows, metric]);
  const { label, unit } = worldMetrics[metric];
  const chosen = cities.findIndex(
    (c) => c.lat === point.lat && c.lon === point.lon,
  );
  const scale = useMemo<[number, number]>(
    () =>
      metric === "temperature"
        ? [-50, 40]
        : metric === "humidity"
          ? [0, 100]
          : metric === "wind"
            ? [0, 15]
            : [
                0,
                Math.max(
                  200,
                  ...reference.points.map((p) => p.metrics.precipitation || 0),
                  ...(grid?.points.map((p) => p.metrics.precipitation || 0) ||
                    []),
                  sum,
                ),
              ],
    [metric, reference, sum, grid],
  );
  const field = useMemo<GlobeField | undefined>(
    () =>
      grid
        ? {
            latitudes: grid.latitudes,
            longitudes: grid.longitudes,
            values: grid.points.map((p) => p.metrics[metric]),
            metric,
            scale,
          }
        : undefined,
    [grid, metric, scale],
  );
  const markers = useMemo(() => {
    const selectedValue =
      metric === "precipitation" ? (values.length ? sum : null) : mean;
    const make = (
      c: { lat: number; lon: number; name: string },
      id: string,
      v: number | null,
    ) => ({
      ...c,
      id,
      label: c.name,
      color: v == null ? "#b6bec3" : weatherColor(metric, v, scale),
      valueLabel:
        v == null || (id !== String(chosen) && id !== "selected")
          ? c.name
          : `${c.name}: ${format(v)} ${unit}`,
    });
    return [
      ...cities.map((c, i) => {
        const v =
          i === chosen
            ? selectedValue
            : (reference.points.find((p) => p.lat === c.lat && p.lon === c.lon)
                ?.metrics[metric] ?? null);
        return make(c, String(i), v);
      }),
      ...(chosen === -1 ? [make(point, "selected", selectedValue)] : []),
    ];
  }, [point, chosen, reference, metric, scale, mean, sum, values.length, unit]);
  function select(lat: number, lon: number) {
    setPoint({
      name: "Вибрана точка",
      lat: Math.round(lat * 100) / 100,
      lon: Math.round(lon * 100) / 100,
    });
  }
  const expected =
    Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  return (
    <>
      <div className="world-hero">
        <section className="world-intro">
          <span className="eyebrow">ПОГОДА У СВІТІ · ERA5</span>
          <h2>
            {label}
            <br />
            {point.name}
          </h2>
          <p>
            Виберіть місто або точку на глобусі. Дані ERA5 стосуються вибраної
            точки.
          </p>
          <label className="world-field">
            Місце
            <select
              aria-label="Місто світу"
              value={chosen === -1 ? "custom" : String(chosen)}
              onChange={(e) => setPoint(cities[+e.target.value])}
            >
              {chosen === -1 && <option value="custom">Вибрана точка</option>}
              {cities.map((c, i) => (
                <option value={i} key={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <p className="point-country" aria-label="Країна вибраної точки">
            {country?.name}
          </p>
          <details className="point-coordinates">
            <summary>Розташування точки</summary>
            <p>
              {point.lat.toFixed(2)}°, {point.lon.toFixed(2)}°
            </p>
          </details>
          <div className="world-period">
            <label>
              Від
              <input
                type="date"
                aria-label="Початок світової погоди"
                min="1940-01-01"
                max={end}
                value={start}
                onChange={(e) => {
                  if (e.target.value && e.target.value <= end)
                    setStart(e.target.value);
                }}
              />
            </label>
            <label>
              До
              <input
                type="date"
                aria-label="Кінець світової погоди"
                min={start}
                value={end}
                onChange={(e) => {
                  if (e.target.value && e.target.value >= start)
                    setEnd(e.target.value);
                }}
              />
            </label>
          </div>
          <div className="world-latest">
            <span>
              {metric === "precipitation"
                ? "Сума за період"
                : "Середнє за період"}
            </span>
            <strong>
              {loading
                ? "…"
                : format(
                    metric === "precipitation"
                      ? values.length
                        ? sum
                        : null
                      : mean,
                  )}
              <small> {unit}</small>
            </strong>
            <span>
              {values.length} із {expected} днів ·{" "}
              {format(expected ? (values.length / expected) * 100 : 0)}%
              покриття
            </span>
          </div>
        </section>
        <Globe
          field={field}
          markers={markers}
          focus={point}
          onCountryChange={setCountry}
          onSelect={select}
          onMarkerSelect={(id) => {
            if (id !== "selected") setPoint(cities[+id]);
          }}
        />
      </div>
      <div className="map-legend weather-map-legend">
        <WeatherLegend
          metric={metric}
          scale={scale}
          unit={unit}
          label={label}
        />
        <span>
          {grid
            ? "Кольоровий шар ERA5 · інтерполяція сітки 15° · " +
              (metric === "precipitation" ? "сума" : "середнє") +
              " за вибраний період. Пропуски не зафарбовуються."
            : "Кольоровий шар очікує дані."}
        </span>
      </div>
      {gridLoading && (
        <p className="analytics-note" role="status">
          Завантажуємо глобальний погодний шар… Для нового періоду перше
          завантаження може тривати кілька хвилин.
        </p>
      )}
      {gridError && (
        <div className="error" role="alert">
          {gridError}
          <button
            className="secondary"
            onClick={() => setRetryGrid((n) => n + 1)}
          >
            Повторити завантаження шару
          </button>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <p className="analytics-note" role="status">
          Отримуємо добові дані ERA5 для вибраної точки…
        </p>
      )}
      {data && !values.length && (
        <p className="analytics-note">
          Для вибраного показника й періоду немає даних.
        </p>
      )}
      {data && values.length > 0 && (
        <>
          <ChartCard
            title={`${label} · добові значення`}
            note={`${data.source}; ${point.name}. ${metric === "precipitation" && values.length < expected ? "Сума неповна: є пропуски." : "Пропуски не замінюються нулями."}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => v.slice(5)}
                  minTickGap={40}
                />
                <YAxis unit={` ${unit}`} />
                <Tooltip formatter={(v) => `${format(Number(v))} ${unit}`} />
                <Line
                  dataKey="value"
                  name={label}
                  dot={false}
                  stroke="#c68e56"
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <Analytics
            rows={values.map((r) => ({
              x: Date.parse(r.date) / 86400000 / 365.2425 + 1970,
              value: r.value,
            }))}
            unit={unit}
            note="Наявні добові значення вибраної точки; пропуски виключено."
          />
          <ChartCard
            title={`${label} · за місяцями`}
            note={
              metric === "precipitation"
                ? "Сума наявних добових опадів за кожен місяць."
                : "Середнє наявних добових значень за кожен місяць."
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" minTickGap={35} />
                <YAxis />
                <Tooltip formatter={(v) => `${format(Number(v))} ${unit}`} />
                <Bar dataKey="value" name={label} fill="#609b87" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      )}
      <p className="analytics-note">
        Джерело:{" "}
        <a
          href="https://open-meteo.com/en/docs/historical-weather-api"
          target="_blank"
          rel="noreferrer"
        >
          Open-Meteo / ECMWF ERA5 · CC BY 4.0
        </a>
        . Доба UTC; вітер — середня швидкість на 10 м, вологість — на 2 м.{" "}
        {data && (
          <>
            Точка сітки: {data.grid_latitude.toFixed(2)}°,{" "}
            {data.grid_longitude.toFixed(2)}°.{" "}
            <a href={data.url} target="_blank" rel="noreferrer">
              Оригінальна відповідь ↗
            </a>
          </>
        )}
      </p>
    </>
  );
}
