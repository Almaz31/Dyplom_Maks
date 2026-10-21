import { useEffect, useMemo, useState } from "react";
import {
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
  AlertTriangle,
  Upload,
  ArrowDownToLine,
  Play,
  Pause,
} from "lucide-react";
import FilterPanel from "./FilterPanel";
import Summary, { plural } from "./Summary";
import { useQueryState, updateQuery } from "./navigation";
import { api, format } from "./api";
import { UkraineMap } from "./UkraineMap";
import DisasterDetail from "./DisasterDetail";
import Pagination, { usePagination } from "./Pagination";
import DisasterAnalytics from "./DisasterAnalytics";
import { DisasterSymbol } from "./disasterSymbols";
import {
  eventDate,
  type DisasterCatalog,
  type DisasterAnalysis,
  type DisasterEvent,
  type Impact,
} from "./disasterTypes";

function impact(value: Impact | undefined, unit = "") {
  return (
    <>
      <strong>
        {format(value?.value)}
        {unit && <small>{unit}</small>}
      </strong>
      <small>
        Відомо для {value?.known ?? 0} подій · пропуски: {value?.unknown ?? 0}
      </small>
    </>
  );
}
export default function DisastersPage({
  catalogs,
  regions,
  onUpload,
}: {
  catalogs: DisasterCatalog[];
  regions: Record<string, string>;
  onUpload: () => void;
}) {
  const [selected, setSelected] = useQueryState(
    "d_catalog",
    catalogs[0]?.id || "",
  );
  const [start, setStart] = useQueryState("d_start", ""),
    [end, setEnd] = useQueryState("d_end", "");
  const [region, setRegion] = useQueryState("d_region", "all"),
    [type, setType] = useQueryState("d_type", ""),
    [group, setGroup] = useQueryState("d_group", "");
  const [showAllImpacts, setShowAllImpacts] = useState(false);
  const [result, setResult] = useState<DisasterAnalysis | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [picked, setPicked] = useState<DisasterEvent | null>(null);
  const [view, setView] = useQueryState<"overview" | "statistics">(
    "d_view",
    "overview",
  );
  const [frame, setFrame] = useQueryState<number | null>("d_frame", null),
    [playing, setPlaying] = useState(false);
  const catalog = catalogs.find((c) => c.id === selected);
  useEffect(() => {
    if (!catalogs.some((c) => c.id === selected))
      setSelected(catalogs[0]?.id || "");
  }, [catalogs, selected]);
  useEffect(() => {
    if (!catalog) return;
    if (!start) setStart(catalog.report.start);
    if (!end) setEnd(catalog.report.end);
  }, [catalog?.id, start, end]);
  useEffect(() => {
    if (picked)
      document
        .querySelector(".disaster-detail")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [picked]);
  const params = useMemo(
    () => new URLSearchParams({ start, end, region, event_type: type, group }),
    [start, end, region, type, group],
  );
  useEffect(() => {
    if (!selected || !start || !end || start > end) return;
    const c = new AbortController();
    setError("");
    setLoading(true);
    setResult(null);
    setPicked(null);
    const t = setTimeout(
      () =>
        api<DisasterAnalysis>(
          `/disaster-datasets/${selected}/analysis?${params}`,
          { signal: c.signal },
        )
          .then(setResult)
          .catch((e) => {
            if (e.name !== "AbortError") setError(e.message);
          })
          .finally(() => {
            if (!c.signal.aborted) setLoading(false);
          }),
      120,
    );
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [selected, params]);
  const years = useMemo(
    () =>
      start && end
        ? Array.from(
            { length: +end.slice(0, 4) - +start.slice(0, 4) + 1 },
            (_, i) => +start.slice(0, 4) + i,
          )
        : [],
    [start, end],
  );
  useEffect(() => {
    if (frame != null && !years.includes(frame)) setFrame(null);
  }, [years, frame]);
  useEffect(() => {
    if (!playing || !years.length) return;
    const t = setInterval(
      () =>
        setFrame(
          (old) => years[(years.indexOf(old ?? years[0]) + 1) % years.length],
        ),
      1100,
    );
    return () => clearInterval(t);
  }, [playing, years]);
  const events =
    result?.events.filter(
      (e) =>
        frame == null ||
        (e.start <= `${frame}-12-31` && e.end >= `${frame}-01-01`),
    ) || [];
  const pagination = usePagination(events, `${selected}:${params}:${frame}`);
  useEffect(() => setPicked(null), [frame]);
  const frameTypes = Object.values(
    events.reduce<
      Record<string, { type: string; label: string; count: number }>
    >((types, event) => {
      const item = (types[event.type] ??= {
        type: event.type,
        label: event.type_label,
        count: 0,
      });
      item.count++;
      return types;
    }, {}),
  ).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "uk"));
  const map = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(regions).map((r) => [
          r,
          {
            value: events.filter((e) => e.regions.includes(r)).length,
            coverage: 100,
          },
        ]),
      ),
    [regions, events],
  );
  const max = useMemo(
    () => Math.max(1, ...Object.values(result?.map || {}).map((v) => v.value)),
    [result],
  );
  const activeFilterCount = [
    region !== "all",
    !!type,
    !!group,
    catalog && (start !== catalog.report.start || end !== catalog.report.end),
  ].filter(Boolean).length;
  if (!catalog)
    return (
      <section className="empty-hero">
        <div className="empty-art">
          <AlertTriangle size={70} />
        </div>
        <div>
          <h2>Додайте EM-DAT</h2>
          <button className="primary" onClick={onUpload}>
            <Upload size={16} />
            Завантажити EM-DAT
          </button>
        </div>
      </section>
    );
  return (
    <div className="disasters-page">
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="dataset-strip">
        <AlertTriangle size={18} />
        <select
          aria-label="Каталог катастроф"
          value={selected}
          onChange={(e) => {
            const c = catalogs.find((c) => c.id === e.target.value)!;
            updateQuery({
              d_catalog: c.id,
              d_start: c.report.start,
              d_end: c.report.end,
              d_region: "all",
              d_type: "",
              d_group: "",
              d_frame: null,
            });
            setPlaying(false);
          }}
        >
          {catalogs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="tag">{catalog.report.count} подій</span>
        <span className="tag">EM-DAT / CRED</span>
        <button className="text-btn" onClick={onUpload}>
          <Upload size={15} />
          Керувати даними
        </button>
      </div>
      <nav className="disaster-view-tabs" aria-label="Розділи катастроф">
        <button
          className={view === "overview" ? "selected" : ""}
          aria-pressed={view === "overview"}
          onClick={() => setView("overview")}
        >
          Карта та події
        </button>
        <button
          className={view === "statistics" ? "selected" : ""}
          aria-pressed={view === "statistics"}
          onClick={() => setView("statistics")}
        >
          Статистика
        </button>
      </nav>
      <FilterPanel
        summary={`Фільтри · ${activeFilterCount} ${plural(activeFilterCount, "активний", "активні", "активних")}`}
      >
        <div className="disaster-filters">
          <label>
            Територія
            <select
              aria-label="Територія катастроф"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="all">Уся Україна</option>
              {Object.entries(regions).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Група
            <select
              aria-label="Група катастроф"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="">Усі</option>
              <option value="Natural">Природні</option>
              <option value="Technological">Техногенні</option>
            </select>
          </label>
          <label>
            Тип
            <select
              aria-label="Тип катастрофи"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Усі типи</option>
              {Object.keys(catalog.report.types)
                .sort()
                .map((t) => (
                  <option key={t} value={t}>
                    {result?.types.find((v) => v.type === t)?.label || t}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Від
            <input
              aria-label="Початок катастроф"
              type="date"
              value={start}
              min={catalog.report.start}
              max={end}
              onChange={(e) => {
                if (e.target.value && e.target.value <= end)
                  setStart(e.target.value);
              }}
            />
          </label>
          <label>
            До
            <input
              aria-label="Кінець катастроф"
              type="date"
              value={end}
              min={start}
              max={catalog.report.end}
              onChange={(e) => {
                if (e.target.value && e.target.value >= start)
                  setEnd(e.target.value);
              }}
            />
          </label>
        </div>
      </FilterPanel>
      {result && !loading && (
        <Summary
          title="Події за вибраний період"
          source={`EM-DAT / CRED · ${start} — ${end} · ${region === "all" ? "Україна" : regions[region]}`}
        >
          {result.stats.count
            ? (() => {
                const peak = result.series.reduce(
                  (best, row) => (row.count > best.count ? row : best),
                  result.series[0],
                );
                return (
                  <>
                    {result.stats.count}{" "}
                    {plural(
                      result.stats.count,
                      "унікальна подія",
                      "унікальні події",
                      "унікальних подій",
                    )}
                    .{" "}
                    {peak && (
                      <>
                        Найбільше початків подій — {peak.year}: {peak.count}.
                      </>
                    )}
                  </>
                );
              })()
            : "За вибраними фільтрами подій немає."}
        </Summary>
      )}
      <button
        className="text-btn impact-toggle"
        aria-expanded={showAllImpacts}
        onClick={() => setShowAllImpacts(!showAllImpacts)}
      >
        {showAllImpacts ? "Згорнути наслідки" : "Усі наслідки та повнота даних"}
      </button>
      <div className={`impact-grid ${showAllImpacts ? "all-impacts" : ""}`}>
        <article>
          <span>Унікальні катастрофи</span>
          <strong>{loading ? "…" : (result?.stats.count ?? 0)}</strong>
          <small>
            {result?.stats.located ?? 0} із визначеною областю ·{" "}
            {result?.stats.unlocated ?? 0} без області
          </small>
        </article>
        <article>
          <span>Загиблі та зниклі</span>
          {impact(result?.stats.deaths)}
        </article>
        <article>
          <span>Постраждалі</span>
          {impact(result?.stats.affected)}
        </article>
        <article>
          <span>Відомі збитки</span>
          {impact(result?.stats.damage, "USD")}
          <small>Номінальні суми різних років</small>
        </article>
      </div>
      {view === "overview" && (
        <>
          <div className="disaster-map-layout primary-workspace">
            <section className="map-panel">
              <div className="panel-heading">
                <div>
                  <h3>
                    {frame ?? "Увесь період"} · {events.length}{" "}
                    {plural(
                      events.length,
                      "унікальна подія",
                      "унікальні події",
                      "унікальних подій",
                    )}
                  </h3>
                </div>
                <button
                  className="secondary"
                  onClick={() => {
                    setFrame(null);
                    setPlaying(false);
                  }}
                >
                  Увесь період
                </button>
              </div>
              <UkraineMap
                values={loading ? {} : map}
                selected={region}
                onSelect={setRegion}
                regions={regions}
                unit="подій"
                scale={[0, max]}
                disasterMode
                events={events}
                onEventSelect={setPicked}
              />
              <div className="map-legend">
                <span>Від 0 до {max} подій, пов’язаних з областю</span>
                <span className="nodata">
                  <i className="event-dot" />
                  Оберіть область, щоб побачити типи подій
                </span>
              </div>
            </section>
            <aside className="disaster-aside">
              <h3>Типи катастроф · {frame ?? "усі роки"}</h3>
              <div className="type-list" aria-label="Легенда катастроф">
                {frameTypes.map((t) => (
                  <button
                    key={t.type}
                    data-disaster-type={t.type}
                    onClick={() => setType(t.type)}
                  >
                    <DisasterSymbol type={t.type} />
                    <span>{t.label}</span>
                    <b>{t.count}</b>
                  </button>
                ))}
              </div>
              {!events.length && (
                <p className="legend-empty">
                  За вибраний рік і фільтри подій немає.
                </p>
              )}
              <div className="filter-note">
                <p>
                  Колір показує кількість подій. Значки з’являються після вибору
                  області. Позначки в її центрі не є точними місцями катастроф.
                </p>
              </div>
              {picked && (
                <DisasterDetail
                  event={picked}
                  regions={regions}
                  onClose={() => setPicked(null)}
                />
              )}
            </aside>
          </div>
          <section className="timeline-panel">
            <button
              className="play-btn"
              aria-label={
                playing ? "Зупинити катастрофи" : "Анімація катастроф"
              }
              onClick={() => {
                setPlaying(!playing);
                if (frame == null) setFrame(years[0]);
              }}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <div className="timeline-label">
              <strong>Катастрофи у часі</strong>
              <span>{frame ?? "Увесь період"} · річний крок</span>
            </div>
            <div className="timeline-track">
              <input
                type="range"
                aria-label="Таймлайн катастроф"
                min="0"
                max={Math.max(0, years.length - 1)}
                value={Math.max(0, years.indexOf(frame ?? years[0]))}
                onChange={(e) => {
                  setFrame(years[+e.target.value]);
                  setPlaying(false);
                }}
              />
              <div className="timeline-ticks">
                <span>{years[0]}</span>
                <span>{years.at(-1)}</span>
              </div>
            </div>
            <button
              className="text-btn"
              onClick={() => {
                setFrame(null);
                setPlaying(false);
              }}
            >
              Усі роки
            </button>
          </section>
          <section className="events-table-panel">
            <div className="panel-heading">
              <div>
                <h3>{events.length} подій у кадрі</h3>
              </div>
              <a
                className="secondary"
                href={`/api/disaster-datasets/${selected}/export?${params}`}
              >
                <ArrowDownToLine size={15} />
                Експорт періоду CSV
              </a>
            </div>
            <div className="desktop-events table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Подія</th>
                    <th>Дата</th>
                    <th>Місце</th>
                    <th>Загиблі</th>
                    <th>Постраждалі</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.rows.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <button
                          className="text-btn"
                          onClick={() => setPicked(e)}
                        >
                          {e.type_label}
                        </button>
                      </td>
                      <td>{eventDate(e)}</td>
                      <td className="event-location">
                        {e.regions.length
                          ? e.regions.map((r) => regions[r]).join(", ")
                          : "Область не визначено"}
                      </td>
                      <td>{format(e.deaths)}</td>
                      <td>{format(e.affected)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!events.length && (
                <p className="empty-message">
                  За цим періодом і фільтром подій немає.
                </p>
              )}
            </div>
            <div className="mobile-events">
              {pagination.rows.map((e) => (
                <article className="mobile-event" key={e.id}>
                  <div>
                    <DisasterSymbol type={e.type} />
                    <button className="text-btn" onClick={() => setPicked(e)}>
                      {e.type_label}
                    </button>
                  </div>
                  <p>{eventDate(e)}</p>
                  <p className="mobile-event-location">
                    {e.regions.length
                      ? e.regions.map((r) => regions[r]).join(", ")
                      : "Область не визначено"}
                  </p>
                  <dl>
                    <div>
                      <dt>Загиблі</dt>
                      <dd>{format(e.deaths)}</dd>
                    </div>
                    <div>
                      <dt>Постраждалі</dt>
                      <dd>{format(e.affected)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
              {!events.length && (
                <p className="empty-message">За цими фільтрами подій немає.</p>
              )}
            </div>
            <Pagination {...pagination} />
          </section>
          <p className="disaster-footnote">
            «—» — невідомо. Неповних дат: {result?.stats.incomplete_dates ?? 0}.
          </p>
        </>
      )}
      {view === "statistics" && (
        <section className="disaster-statistics">
          <div className="section-title">
            <h2>Статистика за вибраний період</h2>
          </div>{" "}
          <section className="chart-panel">
            <div className="panel-heading">
              <div>
                <h3>Кількість катастроф за роком початку</h3>
              </div>
              <span className="tag">
                {region === "all" ? "Уся Україна" : regions[region]}
              </span>
            </div>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={result?.series || []}>
                  <CartesianGrid vertical={false} stroke="#e9ece6" />
                  <XAxis dataKey="year" tickLine={false} axisLine={false} />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    name="Катастрофи"
                    fill="#c89754"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                  {frame != null && (
                    <ReferenceLine x={String(frame)} stroke="#77511e" />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-footer">
              <span>Графік — рік початку; карта — рік події.</span>
              <span>EM-DAT / CRED</span>
            </div>
          </section>
          {result && !loading && <DisasterAnalytics result={result} />}
        </section>
      )}
    </div>
  );
}
