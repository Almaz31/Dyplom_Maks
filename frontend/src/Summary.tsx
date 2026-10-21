import type { ReactNode } from "react";

export function plural(n: number, one: string, few: string, many: string) {
  const value = Math.abs(n) % 100,
    last = value % 10;
  return value >= 11 && value <= 14
    ? many
    : last === 1
      ? one
      : last >= 2 && last <= 4
        ? few
        : many;
}

export default function Summary({
  title,
  children,
  source,
}: {
  title: string;
  children: ReactNode;
  source: string;
}) {
  return (
    <section className="result-summary" aria-label="Головний висновок">
      <h3>{title}</h3>
      <p>{children}</p>
      <span>{source}</span>
    </section>
  );
}
