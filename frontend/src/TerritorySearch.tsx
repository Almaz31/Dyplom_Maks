import { useEffect, useId, useMemo, useState } from "react";
import { Search } from "lucide-react";

type Place = { id: string; name: string };
const normalize = (text: string) =>
  text
    .toLocaleLowerCase("uk-UA")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "");
export default function TerritorySearch({
  options,
  value,
  onChange,
  label,
  optional = false,
}: {
  options: Place[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  optional?: boolean;
}) {
  const id = useId(),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0);
  const selected = options.find((option) => option.id === value);
  const results = useMemo(() => {
    const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
    const matched = options.filter((option) =>
      tokens.every((token) =>
        normalize(option.name + " " + option.id).includes(token),
      ),
    );
    return (
      optional ? [{ id: "", name: "Не вибрано" }, ...matched] : matched
    ).slice(0, 60);
  }, [options, query, optional]);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active, id, query]);
  function choose(option: Place) {
    onChange(option.id);
    setOpen(false);
    setQuery("");
    setActive(0);
  }
  return (
    <div className="territory-search">
      <Search size={17} aria-hidden="true" />
      <input
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={id}
        aria-activedescendant={
          open && results[active] ? `${id}-${active}` : undefined
        }
        autoComplete="off"
        disabled={!options.length}
        placeholder={
          options.length
            ? "Знайдіть місто, країну або область"
            : "Завантаження територій…"
        }
        value={open ? query : selected?.name || ""}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((index) =>
              Math.max(
                0,
                Math.min(
                  results.length - 1,
                  index + (e.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            );
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            if (results[active]) choose(results[active]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            setQuery("");
          }
        }}
      />
      {open && (
        <ul
          id={id}
          role="listbox"
          aria-label="Знайдені території"
          className="territory-results"
        >
          {results.map((option, index) => (
            <li
              key={option.id}
              id={`${id}-${index}`}
              role="option"
              aria-selected={option.id === value}
              className={active === index ? "focused" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(option)}
            >
              <span>{option.name}</span>
              {option.id.startsWith("country:") && <small>Країна</small>}
            </li>
          ))}
          {!results.length && (
            <li role="presentation" className="territory-empty">
              Нічого не знайдено в цьому джерелі. Спробуйте іншу назву.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
