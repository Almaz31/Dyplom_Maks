import { ArrowRight, Download, Plus } from "lucide-react";
import type { Dataset, Metadata } from "./api";
import type { DisasterCatalog } from "./disasterTypes";
import { plural } from "./Summary";

type Props = {
  datasets: Dataset[];
  catalogs: DisasterCatalog[];
  meta: Metadata | null;
  onOpenWeather: (id: string) => void;
  onOpenCatalog: (id: string) => void;
  onSample: () => void;
  loadingSample: boolean;
};

export default function DatasetsPage({
  datasets,
  catalogs,
  meta,
  onOpenWeather,
  onOpenCatalog,
  onSample,
  loadingSample,
}: Props) {
  const sources = new Map<string, Dataset[]>();
  for (const dataset of datasets) {
    const key = dataset.source || "Власні дані";
    sources.set(key, [...(sources.get(key) || []), dataset]);
  }
  function row(dataset: Dataset, recommended = false) {
    return (
      <article className="dataset-row" key={dataset.id}>
        <div className="dataset-row-main">
          <h3>{dataset.name}</h3>
          {recommended && (
            <span className="tag recommended">Найповніший набір джерела</span>
          )}
          <p>
            {dataset.report.start} — {dataset.report.end} ·{" "}
            {dataset.report.valid.toLocaleString("uk-UA")} записів ·{" "}
            {dataset.report.regions.length} територій
          </p>
          <p>
            {dataset.report.variables
              .map((v) => meta?.variables[v].label || v)
              .join(" · ")}{" "}
            ·{" "}
            {dataset.spatial_kind === "point"
              ? "Дані точок"
              : "Регіональні дані"}
          </p>
        </div>
        <div className="dataset-row-actions">
          <button
            className="secondary"
            onClick={() => onOpenWeather(dataset.id)}
          >
            Дослідити
            <ArrowRight size={16} />
          </button>
          <a
            href={`/api/datasets/${dataset.id}/original`}
            className="text-btn"
            title="Завантажити оригінал"
          >
            <Download size={16} />
            CSV
          </a>
        </div>
      </article>
    );
  }
  return (
    <section className="datasets-page">
      <p className="page-description">
        Завантажте погодний CSV або EM-DAT Excel кнопками вище. Оберіть готовий
        набір, щоб почати дослідження.
      </p>
      <section className="catalog-section">
        <h2>Каталоги катастроф</h2>
        <div className="catalog-list">
          {catalogs.map((c) => (
            <article className="dataset-row" key={c.id}>
              <div className="dataset-row-main">
                <h3>{c.name}</h3>
                <p>
                  EM-DAT / CRED · {c.report.count}{" "}
                  {plural(c.report.count, "подія", "події", "подій")} ·{" "}
                  {c.report.start} — {c.report.end}
                </p>
              </div>
              <button className="secondary" onClick={() => onOpenCatalog(c.id)}>
                Відкрити каталог
                <ArrowRight size={16} />
              </button>
            </article>
          ))}
        </div>
        {!catalogs.length && (
          <p className="empty-message">
            Каталогів ще немає. Додайте EM-DAT Excel.
          </p>
        )}
      </section>
      <div className="section-title">
        <h2>
          Погодні набори <span>{datasets.length}</span>
        </h2>
        <a className="secondary" href="/api/sample">
          <Download size={16} />
          Приклад CSV
        </a>
      </div>
      {[...sources].map(([source, items]) => {
        const ordered = [...items].sort(
          (a, b) => b.report.valid - a.report.valid,
        );
        return (
          <section className="dataset-source" key={source}>
            <h3>{source}</h3>
            {row(ordered[0], ordered.length > 1)}
            {ordered.length > 1 && (
              <details className="dataset-archives">
                <summary>
                  Інші періоди та вибірки · {ordered.length - 1}
                </summary>
                {ordered.slice(1).map((d) => row(d))}
              </details>
            )}
          </section>
        );
      })}
      {!datasets.length && (
        <p className="empty-message">
          Додайте власний CSV або почніть із прикладу ERA5.
        </p>
      )}
      <div className="sample-inline">
        <div>
          <h3>Приклад ERA5</h3>
          <p>27 територій України · дані точок біля міст</p>
        </div>
        <button
          className="secondary"
          disabled={loadingSample}
          onClick={onSample}
        >
          {loadingSample ? "Завантаження…" : "Додати приклад"}
          <Plus size={16} />
        </button>
        <a href="/api/sample/source" target="_blank" rel="noreferrer">
          Походження даних ↗
        </a>
      </div>
    </section>
  );
}
