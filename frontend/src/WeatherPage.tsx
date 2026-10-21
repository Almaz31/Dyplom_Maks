import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Database,
  Map as MapIcon,
  Play,
  Pause,
  Thermometer,
  CloudRain,
  Droplets,
  Wind,
  ChevronRight,
  Upload,
  CalendarDays,
} from "lucide-react";
import { format, type Dataset, type Metadata, type Metric } from "./api";
import { UkraineMap } from "./UkraineMap";
import { WeatherLegend } from "./weatherPalette";
import Analytics from "./Analytics";
import FilterPanel from "./FilterPanel";
import { useWeatherData } from "./useWeatherData";
const metricIcons = {
  temperature: Thermometer,
  precipitation: CloudRain,
  humidity: Droplets,
  wind: Wind,
};
const dateLabel = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
export default function WeatherPage({
  meta,
  datasets,
  onNavigate,
  onImport,
  onSample,
  loadingSample,
}: {
  meta: Metadata | null;
  datasets: Dataset[];
  onNavigate: (page: string) => void;
  onImport: () => void;
  onSample: () => void;
  loadingSample: boolean;
}) {
  const {
    selected,
    setSelected,
    metric,
    setMetric,
    region,
    setRegion,
    start,
    setStart,
    end,
    setEnd,
    cursor,
    setCursor,
    playing,
    setPlaying,
    analysis,
    mapValues,
    pending,
    mapPending,
    mapMode,
    setMapMode,
    dataset,
    months,
    activeMonths,
    scale,
    error,
  } = useWeatherData(datasets);
  const unit = meta?.variables[metric].unit || "",
    stats = analysis?.stats,
    Icon = metricIcons[metric];
  const query = new URLSearchParams({ region, start, end });
  const ticks = months.filter(
    (_, i) =>
      i === 0 ||
      i === months.length - 1 ||
      i % Math.max(1, Math.ceil(months.length / 6)) === 0,
  );
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!dataset ? (
        <section className="empty-hero">
          <div className="empty-art">
            <MapIcon size={78} strokeWidth={0.8} />
          </div>
          <div>
            <h2>Додайте погодні дані</h2>
            <div className="button-row">
              <button
                className="primary"
                onClick={onSample}
                disabled={loadingSample}
              >
                {loadingSample ? "Готуємо приклад…" : "Відкрити приклад ERA5"}
                <ArrowRight size={18} />
              </button>
              <button className="secondary" onClick={onImport}>
                <Upload size={17} />
                Власний CSV
              </button>
            </div>
            <small>ERA5 · точки біля міст · 27 територій України.</small>
          </div>
        </section>
      ) : (
        <>
          <div className="dataset-strip">
            <Database size={18} />
            <select
              aria-label="Активний датасет"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {datasets.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <span className="tag">
              {dataset.report.valid.toLocaleString("uk-UA")} записів
            </span>
            <span className="tag">
              {dataset.report.regions.length} територій
            </span>
            <button className="text-btn" onClick={() => onNavigate("datasets")}>
              Про набір
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="workspace">
            <aside className="filter-panel">
              <FilterPanel summary="Показник, територія та період">
                <h3>Показник</h3>
                <div className="metric-options">
                  {Object.entries(meta?.variables || {}).map(([key, v]) => {
                    const I = metricIcons[key as Metric];
                    return (
                      <button
                        key={key}
                        disabled={
                          !dataset.report.variables.includes(key as Metric)
                        }
                        className={metric === key ? "metric active" : "metric"}
                        onClick={() => setMetric(key as Metric)}
                      >
                        <I size={19} />
                        <span>{v.label}</span>
                        <small>{v.unit}</small>
                        {metric === key && <ChevronRight size={14} />}
                      </button>
                    );
                  })}
                </div>
                <label className="field-label">
                  Територія
                  <select
                    aria-label="Область"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  >
                    {Object.entries(meta?.regions || {}).map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                        {!dataset.report.regions.includes(code)
                          ? " · немає даних"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Початок періоду
                  <input
                    type="date"
                    aria-label="Початок періоду"
                    min={dataset.report.start}
                    max={end}
                    value={start}
                    onChange={(e) => {
                      if (
                        e.target.value &&
                        e.target.value <= end &&
                        e.target.value >= dataset.report.start
                      )
                        setStart(e.target.value);
                    }}
                  />
                </label>
                <label className="field-label">
                  Кінець періоду
                  <input
                    type="date"
                    aria-label="Кінець періоду"
                    min={start}
                    max={dataset.report.end}
                    value={end}
                    onChange={(e) => {
                      if (
                        e.target.value &&
                        e.target.value >= start &&
                        e.target.value <= dataset.report.end
                      )
                        setEnd(e.target.value);
                    }}
                  />
                </label>
                <p className="spatial-note">
                  {dataset.spatial_kind === "point"
                    ? "Дані точки, не середнє по області."
                    : "Дані області."}
                </p>
                <a
                  className="export-link"
                  href={`/api/datasets/${selected}/export?${query}`}
                >
                  <ArrowDownToLine size={17} />
                  Експорт CSV
                </a>
              </FilterPanel>
            </aside>
            <section className="map-panel">
              <div className="panel-heading">
                <div>
                  <h3>{meta?.variables[metric].label} на карті</h3>
                </div>
                <div className="segmented">
                  <button
                    className={mapMode === "frame" ? "selected" : ""}
                    onClick={() => setMapMode("frame")}
                  >
                    Місяць
                  </button>
                  <button
                    className={mapMode === "period" ? "selected" : ""}
                    onClick={() => setMapMode("period")}
                  >
                    Увесь період
                  </button>
                </div>
              </div>
              <div className="map-frame">
                <div className="map-date">
                  <CalendarDays size={14} />
                  {mapMode === "frame" ? cursor : `${start} — ${end}`}
                  <span>{metric === "precipitation" ? "сума" : "середнє"}</span>
                  {mapPending && <span>оновлення…</span>}
                </div>
                {meta && (
                  <UkraineMap
                    values={mapValues}
                    metric={metric}
                    selected={region}
                    onSelect={setRegion}
                    regions={meta.regions}
                    unit={unit}
                    scale={scale}
                  />
                )}
              </div>
              <div className="map-legend weather-map-legend">
                <WeatherLegend
                  metric={metric}
                  scale={scale}
                  unit={unit}
                  label={meta?.variables[metric].label || ""}
                />
                <span className="nodata">
                  <i />
                  Немає даних
                </span>
              </div>
            </section>
            <aside className="stats-panel">
              <h3>{meta?.regions[region]}</h3>
              <p className="stats-period">
                {start && dateLabel(start)} —<br />
                {end && dateLabel(end)}
              </p>
              <div className="main-stat">
                <span>
                  {metric === "precipitation"
                    ? "Сума за період"
                    : "Середнє за період"}
                </span>
                <strong>
                  {pending
                    ? "…"
                    : format(
                        metric === "precipitation" ? stats?.sum : stats?.mean,
                      )}
                  <small>{unit}</small>
                </strong>
                <span className="stat-caption">
                  {metric === "precipitation" && stats && stats.coverage < 100
                    ? "Неповна сума: є пропущені дні"
                    : ""}
                </span>
              </div>
              <div className="stat-pair">
                <div>
                  <span>Мінімум</span>
                  <b>
                    {format(stats?.min)}
                    <small>{unit}</small>
                  </b>
                </div>
                <div>
                  <span>Максимум</span>
                  <b>
                    {format(stats?.max)}
                    <small>{unit}</small>
                  </b>
                </div>
              </div>
            </aside>
          </div>
          <section className="timeline-panel">
            <button
              className="play-btn"
              aria-label={playing ? "Зупинити анімацію" : "Відтворити анімацію"}
              onClick={() => {
                setMapMode("frame");
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <div className="timeline-label">
              <strong>Таймлайн</strong>
              <span>Місячний крок · {cursor}</span>
            </div>
            <div className="timeline-track">
              <input
                type="range"
                aria-label="Таймлайн"
                min="0"
                max={Math.max(0, activeMonths.length - 1)}
                value={Math.max(0, activeMonths.indexOf(cursor))}
                onChange={(e) => {
                  setCursor(activeMonths[+e.target.value]);
                  setPlaying(false);
                  setMapMode("frame");
                }}
              />
              <div className="timeline-ticks">
                {ticks.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            </div>
            <span className="timeline-end">{activeMonths.length} міс.</span>
          </section>
          <section className="chart-panel">
            <div className="panel-heading">
              <div>
                <h3>
                  <Icon size={19} />
                  {meta?.variables[metric].label} · {meta?.regions[region]}
                </h3>
              </div>
              <span className="tag">
                {analysis?.resolution === "monthly"
                  ? "Місячні агрегати"
                  : "Добові значення"}{" "}
                · {unit}
              </span>
            </div>
            {!analysis || !analysis.stats.count ? (
              <div className="chart-empty">
                {pending
                  ? "Розраховуємо часовий ряд…"
                  : "Немає даних у вибраному періоді"}
              </div>
            ) : (
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  {metric === "precipitation" ? (
                    <BarChart data={analysis.series}>
                      <CartesianGrid vertical={false} stroke="#e9ece6" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d) =>
                          analysis.resolution === "monthly"
                            ? d.slice(0, 7)
                            : d.slice(5)
                        }
                        minTickGap={40}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis tickLine={false} axisLine={false} width={42} />
                      <Tooltip
                        formatter={(v) => [
                          `${format(Number(v))} ${unit}`,
                          "Опади",
                        ]}
                      />
                      <Bar
                        dataKey="value"
                        fill="#609b87"
                        radius={[2, 2, 0, 0]}
                      />
                      <ReferenceLine
                        x={cursor + "-01"}
                        stroke="#d69445"
                        strokeDasharray="4 3"
                      />
                    </BarChart>
                  ) : (
                    <AreaChart data={analysis.series}>
                      <defs>
                        <linearGradient
                          id="chartFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#46977b"
                            stopOpacity={0.24}
                          />
                          <stop
                            offset="100%"
                            stopColor="#46977b"
                            stopOpacity={0.01}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#e9ece6" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d) =>
                          analysis.resolution === "monthly"
                            ? d.slice(0, 7)
                            : d.slice(5)
                        }
                        minTickGap={40}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis tickLine={false} axisLine={false} width={42} />
                      <Tooltip
                        formatter={(v) => [
                          `${format(Number(v))} ${unit}`,
                          meta?.variables[metric].label,
                        ]}
                      />
                      <Area
                        type="linear"
                        dataKey="value"
                        stroke="#287b61"
                        fill="url(#chartFill)"
                        strokeWidth={1.8}
                        dot={
                          analysis.stats.count < 50
                            ? { r: 2, fill: "#287b61" }
                            : false
                        }
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                      <ReferenceLine
                        x={cursor + "-01"}
                        stroke="#d69445"
                        strokeDasharray="4 3"
                      />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
            <div className="chart-footer">
              <span>
                <i /> {dataset.source}
              </span>
            </div>
          </section>
          {analysis && (
            <Analytics
              rows={analysis.series
                .filter(
                  (r): r is { date: string; value: number } => r.value != null,
                )
                .map((r) => ({
                  x:
                    new Date(r.date + "T00:00:00Z").getTime() /
                      86400000 /
                      365.2425 +
                    1970,
                  value: r.value,
                }))}
              unit={unit}
              note={
                analysis.resolution === "monthly"
                  ? "Розрахунок за місячними агрегатами, не за добовими значеннями."
                  : "Розрахунок за наявними добовими значеннями; пропуски виключено."
              }
            />
          )}
        </>
      )}
    </>
  );
}
