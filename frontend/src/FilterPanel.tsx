import { useId, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

export default function FilterPanel({
  children,
  summary = "Фільтри",
  advanced = false,
}: {
  children: ReactNode;
  summary?: string;
  advanced?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <section
      className={`filter-disclosure ${advanced ? "advanced-filters" : ""} ${open ? "is-open" : ""}`}
    >
      <button
        className="secondary filter-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <SlidersHorizontal size={17} />
        {summary}
        <span>{open ? "Згорнути" : "Відкрити"}</span>
      </button>
      <div id={id} className="filter-content">
        {children}
      </div>
    </section>
  );
}
