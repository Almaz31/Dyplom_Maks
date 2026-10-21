import { lazy, Suspense, useState } from "react";
import {
  Database,
  Layers3,
  Map as MapIcon,
  Plus,
  Upload,
  Home,
  ChartNoAxesCombined,
  BookOpen,
  TriangleAlert,
} from "lucide-react";
import { api } from "./api";
import { useNavigation } from "./navigation";
import { useLocalData } from "./useLocalData";
import WeatherPage from "./WeatherPage";
import DatasetsPage from "./DatasetsPage";
import ImportWizard from "./ImportWizard";
import DisasterImport from "./DisasterImport";
import DisastersPage from "./DisastersPage";
import HomePage from "./HomePage";
const WorldDashboard = lazy(() => import("./WorldDashboard"));
const WorldDisasters = lazy(() => import("./WorldDisasters"));
const Prediction = lazy(() => import("./Prediction"));
const AnalyticsCenter = lazy(() => import("./AnalyticsCenter"));
const Methodology = lazy(() => import("./Methodology"));

export default function App() {
  const { page, scope, navigate, setPage, setScope } = useNavigation();
  const {
    meta,
    datasets,
    catalogs,
    error,
    setError,
    refresh,
    refreshCatalogs,
  } = useLocalData();
  const [prediction, setPrediction] = useState(false),
    [modal, setModal] = useState(false),
    [emdatModal, setEmdatModal] = useState(false),
    [loadingSample, setLoadingSample] = useState(false);
  function openWeather(id: string) {
    navigate("explore", "ukraine", {
      w_dataset: id,
      w_start: null,
      w_end: null,
      w_cursor: null,
      w_region: null,
      w_metric: null,
    });
  }
  async function sample() {
    setLoadingSample(true);
    setError("");
    try {
      const r = await api<{ id: string }>("/sample/import", { method: "POST" });
      await refresh();
      openWeather(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingSample(false);
    }
  }
  const title =
    page === "home"
      ? "Кліматична лабораторія"
      : page === "analytics"
        ? "Аналітичний центр"
        : page === "method"
          ? "Методологія та джерела даних"
          : page === "datasets"
            ? "Дані"
            : page === "disasters"
              ? scope === "world"
                ? "Катастрофи світу"
                : "Катастрофи"
              : scope === "world"
                ? "Світова погода"
                : "Погода";
  return (
    <>
      <header className="topbar">
        <a
          className="brand"
          href="?page=home"
          onClick={(e) => {
            e.preventDefault();
            navigate("home", "ukraine");
          }}
        >
          <span className="brand-icon">
            <Layers3 size={23} />
          </span>
          обрій
        </a>
        <nav aria-label="Головна навігація">
          {[
            { id: "home", label: "Головна", Icon: Home },
            { id: "disasters", label: "Катастрофи", Icon: TriangleAlert },
            { id: "explore", label: "Погода", Icon: MapIcon },
            { id: "datasets", label: "Дані", Icon: Database },
            { id: "analytics", label: "Аналітика", Icon: ChartNoAxesCombined },
            { id: "method", label: "Методологія", Icon: BookOpen },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              className={page === id ? "nav-active" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => setPage(id)}
            >
              <Icon size={17} />
              {label}
              {id === "disasters" && (
                <span className="nav-count">
                  {scope === "world"
                    ? "GDIS"
                    : catalogs.reduce((n, c) => n + c.report.count, 0)}
                </span>
              )}
              {id === "datasets" && (
                <span className="nav-count">
                  {datasets.length + catalogs.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {(page === "explore" || page === "disasters") && (
          <div className="scope-bar">
            <span>Масштаб дослідження</span>
            <div
              className="segmented scope-switch"
              role="group"
              aria-label="Масштаб аналітики"
            >
              <button
                className={scope === "ukraine" ? "selected" : ""}
                aria-pressed={scope === "ukraine"}
                onClick={() => setScope("ukraine")}
              >
                Україна
              </button>
              <button
                className={scope === "world" ? "selected" : ""}
                aria-pressed={scope === "world"}
                onClick={() => setScope("world")}
              >
                Світ
              </button>
            </div>
          </div>
        )}
        <div className="page-heading">
          <h1>{title}</h1>
          {page === "datasets" && (
            <div className="button-row page-actions">
              <button className="secondary" onClick={() => setEmdatModal(true)}>
                <Upload size={17} />
                EM-DAT Excel
              </button>
              <button className="primary" onClick={() => setModal(true)}>
                <Plus size={18} />
                Завантажити CSV
              </button>
            </div>
          )}
        </div>
        {error && (
          <div role="alert" className="error">
            {error}
            <button className="text-btn" onClick={() => setError("")}>
              Закрити
            </button>
          </div>
        )}
        <Suspense
          fallback={
            <p className="view-loading" role="status">
              Завантаження розділу…
            </p>
          }
        >
          {page === "home" && <HomePage onNavigate={setPage} />}
          {page === "explore" &&
            (scope === "world" ? (
              <WorldDashboard />
            ) : (
              <WeatherPage
                meta={meta}
                datasets={datasets}
                onNavigate={setPage}
                onImport={() => setModal(true)}
                onSample={sample}
                loadingSample={loadingSample}
              />
            ))}
          {page === "disasters" &&
            (scope === "world" ? (
              <WorldDisasters />
            ) : (
              <DisastersPage
                catalogs={catalogs}
                regions={meta?.regions || {}}
                onUpload={() => setPage("datasets")}
              />
            ))}
          {page === "datasets" && (
            <DatasetsPage
              datasets={datasets}
              catalogs={catalogs}
              meta={meta}
              onOpenWeather={openWeather}
              onOpenCatalog={(id) =>
                navigate("disasters", "ukraine", {
                  d_catalog: id,
                  d_start: null,
                  d_end: null,
                })
              }
              onSample={sample}
              loadingSample={loadingSample}
            />
          )}
          {page === "method" && <Methodology />}
          {page === "analytics" && (
            <AnalyticsCenter
              catalogs={catalogs}
              regions={meta?.regions || {}}
              onOpenPrediction={() => setPrediction(true)}
            />
          )}
        </Suspense>
      </main>
      {prediction && (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <p role="status">Завантаження прогнозу…</p>
            </div>
          }
        >
          <Prediction onClose={() => setPrediction(false)} />
        </Suspense>
      )}
      {emdatModal && (
        <DisasterImport
          onClose={() => setEmdatModal(false)}
          onImported={(id) => {
            setEmdatModal(false);
            refreshCatalogs()
              .then(() =>
                navigate("disasters", "ukraine", {
                  d_catalog: id,
                  d_start: null,
                  d_end: null,
                }),
              )
              .catch((e) => setError(e.message));
          }}
        />
      )}
      {modal && (
        <ImportWizard
          onClose={() => setModal(false)}
          onImported={(id) => {
            setModal(false);
            refresh()
              .then(() => openWeather(id))
              .catch((e) => setError(e.message));
          }}
        />
      )}
    </>
  );
}
