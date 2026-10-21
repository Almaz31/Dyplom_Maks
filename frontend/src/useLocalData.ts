import { useCallback, useEffect, useState } from "react";
import { api, type Dataset, type Metadata } from "./api";
import type { DisasterCatalog } from "./disasterTypes";

export function useLocalData() {
  const [meta, setMeta] = useState<Metadata | null>(null),
    [datasets, setDatasets] = useState<Dataset[]>([]),
    [catalogs, setCatalogs] = useState<DisasterCatalog[]>([]),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setDatasets(await api<Dataset[]>("/datasets"));
  }, []);
  const refreshCatalogs = useCallback(async () => {
    setCatalogs(await api<DisasterCatalog[]>("/disaster-datasets"));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<Metadata>("/metadata", { signal: controller.signal }),
      api<Dataset[]>("/datasets", { signal: controller.signal }),
      api<DisasterCatalog[]>("/disaster-datasets", {
        signal: controller.signal,
      }),
    ])
      .then(([metadata, weather, disasters]) => {
        setMeta(metadata);
        setDatasets(weather);
        setCatalogs(disasters);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, []);
  return {
    meta,
    datasets,
    catalogs,
    error,
    setError,
    refresh,
    refreshCatalogs,
  };
}
