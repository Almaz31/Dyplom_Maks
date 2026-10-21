import {
  ArrowRight,
  ChartNoAxesCombined,
  Database,
  Map,
  TriangleAlert,
} from "lucide-react";

export default function HomePage({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  return (
    <section className="home-page">
      <div className="home-hero">
        <span className="eyebrow">ОБРІЙ · ПОГОДА, КЛІМАТ І КАТАСТРОФИ</span>
        <h2>Від даних — до розуміння змін</h2>
        <p>
          Досліджуйте погоду на карті, порівнюйте кліматичні показники та
          аналізуйте історію катастроф. Почніть із готових наборів або додайте
          власні спостереження.
        </p>
        <button className="primary" onClick={() => onNavigate("analytics")}>
          Відкрити аналітичний центр
          <ArrowRight size={18} />
        </button>
        <p className="home-sources">ERA5 · NASA POWER · EM-DAT · GDIS</p>
      </div>
      <div className="home-destinations">
        {[
          {
            page: "explore",
            Icon: Map,
            title: "Погода на карті",
            text: "Оберіть територію, показник і період.",
          },
          {
            page: "disasters",
            Icon: TriangleAlert,
            title: "Катастрофи",
            text: "Перегляньте події, їхню географію та наслідки.",
          },
          {
            page: "analytics",
            Icon: ChartNoAxesCombined,
            title: "Аналітика",
            text: "Дослідіть аномалії, зв’язки та прогнози.",
          },
          {
            page: "datasets",
            Icon: Database,
            title: "Дані",
            text: "Керуйте наборами та завантажуйте свої файли.",
          },
        ].map(({ page, Icon, title, text }) => (
          <button
            className="home-destination"
            key={page}
            onClick={() => onNavigate(page)}
          >
            <Icon size={26} />
            <h3>{title}</h3>
            <p>{text}</p>
            <span>
              Відкрити
              <ArrowRight size={17} />
            </span>
          </button>
        ))}
      </div>
      <div className="home-method">
        <p>
          Кожен результат має джерело, метод розрахунку та пояснення обмежень.
        </p>
        <button className="text-btn" onClick={() => onNavigate("method")}>
          Переглянути методологію
          <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}
