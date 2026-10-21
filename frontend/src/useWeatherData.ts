import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Dataset, type Metric, type Analysis } from "./api";
import type { MapValues } from "./UkraineMap";
import { useQueryState, updateQuery } from "./navigation";
function monthList(start: string, end: string) {
  const out: string[] = [];
  let d = new Date(start.slice(0, 7) + "-01T00:00:00Z");
  while (d.toISOString().slice(0, 10) <= end) {
    out.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}
function monthEnd(m: string) {
  const [y, n] = m.split("-").map(Number);
  return new Date(Date.UTC(y, n, 0)).toISOString().slice(0, 10);
}
export function useWeatherData(datasets: Dataset[]) {
  const [selected] = useQueryState("w_dataset", "");
  function setSelected(id: string) {
    if (id === selected) return;
    updateQuery({
      w_dataset: id,
      w_start: null,
      w_end: null,
      w_cursor: null,
      w_region: null,
      w_metric: null,
    });
  }
  const [metric, setMetric] = useQueryState<Metric>("w_metric", "temperature");
  const [region, setRegion] = useQueryState("w_region", "UA-46");
  const [start, setStart] = useQueryState("w_start", ""),
    [end, setEnd] = useQueryState("w_end", "");
  const [cursor, setCursor] = useQueryState("w_cursor", "");
  const [mapMode, setMapMode] = useQueryState<"frame" | "period">(
    "w_mode",
    "frame",
  );
  const [playing, setPlaying] = useState(false),
    [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null),
    [mapValues, setMapValues] = useState<MapValues>({}),
    [pending, setPending] = useState(false),
    [mapPending, setMapPending] = useState(false);
  const dataset = datasets.find((d) => d.id === selected);
  const months = useMemo(
    () => (dataset ? monthList(dataset.report.start, dataset.report.end) : []),
    [dataset],
  );
  const activeMonths = months.filter(
    (m) => m >= start.slice(0, 7) && m <= end.slice(0, 7),
  );
  useEffect(() => {
    if (!datasets.length) return;
    if (!datasets.some((d) => d.id === selected)) setSelected(datasets[0].id);
  }, [datasets, selected]);
  const initialized = useRef<string | null>(null);
  useEffect(() => {
    if (!dataset) return;
    const q = new URLSearchParams(location.search);
    if (initialized.current === dataset.id) return;
    initialized.current = dataset.id;
    setStart(q.get("w_start") || dataset.report.start);
    setEnd(q.get("w_end") || dataset.report.end);
    setCursor(q.get("w_cursor") || dataset.report.start.slice(0, 7));
    setRegion(
      q.get("w_region") && dataset.report.regions.includes(q.get("w_region")!)
        ? q.get("w_region")!
        : dataset.report.regions.includes("UA-46")
          ? "UA-46"
          : dataset.report.regions[0],
    );
    setMetric(
      dataset.report.variables.includes(q.get("w_metric") as Metric)
        ? (q.get("w_metric") as Metric)
        : dataset.report.variables[0],
    );
    setPlaying(false);
  }, [dataset?.id]);
  useEffect(() => {
    if (!activeMonths.includes(cursor) && activeMonths.length)
      setCursor(activeMonths[0]);
  }, [start, end, cursor, activeMonths.join(",")]);
  useEffect(() => {
    if (!playing || !activeMonths.length) return;
    const t = setInterval(
      () =>
        setCursor(
          (c) =>
            activeMonths[(activeMonths.indexOf(c) + 1) % activeMonths.length],
        ),
      1000,
    );
    return () => clearInterval(t);
  }, [playing, activeMonths.join(",")]);
  useEffect(() => {
    if (!selected || !start || !end || start > end) {
      setPending(false);
      setAnalysis(null);
      return;
    }
    const c = new AbortController();
    setError("");
    setPending(true);
    setAnalysis(null);
    const t = setTimeout(() => {
      api<Analysis>(
        `/datasets/${selected}/analysis?` +
          new URLSearchParams({ region, variable: metric, start, end }),
        { signal: c.signal },
      )
        .then(setAnalysis)
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!c.signal.aborted) setPending(false);
        });
    }, 140);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [selected, region, metric, start, end]);
  useEffect(() => {
    if (!dataset || !cursor || !start || !end) return;
    const c = new AbortController();
    setMapPending(true);
    const frameStart =
      mapMode === "frame" ? [cursor + "-01", start].sort().at(-1)! : start;
    const frameEnd =
      mapMode === "frame" ? [monthEnd(cursor), end].sort()[0] : end;
    if (frameStart > frameEnd) return () => c.abort();
    const t = setTimeout(() => {
      api<MapValues>(
        `/datasets/${selected}/map?` +
          new URLSearchParams({
            variable: metric,
            start: frameStart,
            end: frameEnd,
          }),
        { signal: c.signal },
      )
        .then(setMapValues)
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!c.signal.aborted) setMapPending(false);
        });
    }, 80);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [selected, metric, cursor, mapMode, start, end]);
  useEffect(() => setMapValues({}), [selected, metric]);
  const scale = useMemo<[number, number]>(
    () =>
      metric === "temperature"
        ? [-15, 35]
        : metric === "humidity"
          ? [0, 100]
          : metric === "wind"
            ? [0, 15]
            : [
                0,
                mapMode === "frame"
                  ? 200
                  : Math.max(
                      200,
                      Math.ceil(
                        Math.max(
                          0,
                          ...Object.values(mapValues).map((v) => v.value),
                        ) / 100,
                      ) * 100,
                    ),
              ],
    [metric, mapMode, mapValues],
  );
  return {
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
  };
}
