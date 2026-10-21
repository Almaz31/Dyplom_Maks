import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { Dispatch, SetStateAction } from "react";

const navigationEvent = "obrii:navigation";
const pages = [
  "home",
  "explore",
  "disasters",
  "datasets",
  "analytics",
  "method",
];
const subscribe = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  window.addEventListener(navigationEvent, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(navigationEvent, listener);
  };
};

export function updateQuery(
  values: Record<string, string | null>,
  replace = true,
) {
  const query = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(values)) {
    if (value === null) query.delete(key);
    else query.set(key, value);
  }
  const search = "?" + query.toString();
  if (search === location.search) return;
  history[replace ? "replaceState" : "pushState"](
    null,
    "",
    search + location.hash,
  );
  window.dispatchEvent(new Event(navigationEvent));
}

/** Route changes push history; filter changes replace the current history entry. */
export function useNavigation() {
  const search = useSyncExternalStore(subscribe, () => location.search);
  const query = new URLSearchParams(search);
  const requested = query.get("page") || "home";
  const page = pages.includes(requested) ? requested : "home";
  const scope = query.get("scope") === "world" ? "world" : "ukraine";
  const navigate = useCallback(
    (
      next: string,
      nextScope?: string,
      values: Record<string, string | null> = {},
    ) => {
      updateQuery(
        {
          page: pages.includes(next) ? next : "home",
          ...(nextScope ? { scope: nextScope } : {}),
          ...values,
        },
        false,
      );
    },
    [],
  );
  return {
    page,
    scope,
    navigate,
    setPage: (next: string) => navigate(next),
    setScope: (next: string) => navigate(page, next),
  };
}

/** Filter state stays in the URL and follows Back, Forward and shared links. */
export function useQueryState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [fallback] = useState(initial);
  const search = useSyncExternalStore(subscribe, () => location.search);
  const decode = useCallback(
    (query: string): T => {
      const raw = new URLSearchParams(query).get(key);
      if (raw === null) return fallback;
      if (typeof fallback === "string") return raw as T;
      try {
        const decoded = JSON.parse(raw);
        if (fallback === null)
          return decoded === null || typeof decoded === "number"
            ? (decoded as T)
            : fallback;
        if (Array.isArray(fallback))
          return Array.isArray(decoded) ? (decoded as T) : fallback;
        if (typeof fallback === "object")
          return decoded &&
            typeof decoded === "object" &&
            !Array.isArray(decoded)
            ? { ...fallback, ...decoded }
            : fallback;
        return typeof decoded === typeof fallback ? (decoded as T) : fallback;
      } catch {
        if (Array.isArray(fallback) && raw.includes("|"))
          return raw.split("|") as T;
        return fallback;
      }
    },
    [key, fallback],
  );
  const value = useMemo(() => decode(search), [search, decode]);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      const resolved =
        typeof next === "function"
          ? (next as (old: T) => T)(decode(location.search))
          : next;
      updateQuery({
        [key]:
          typeof resolved === "string" ? resolved : JSON.stringify(resolved),
      });
    },
    [key, decode],
  );
  return [value, setValue];
}
