import { useCallback, useEffect, useState } from "react";
import type { Trip, TripIndex } from "@retrace/shared";
import { strings } from "./strings.ts";

const SUPPORTED_SCHEMA = 1;

/** A load failure with a German message for the UI. */
export class LoadError extends Error {
  readonly notFound: boolean;
  constructor(message: string, notFound = false) {
    super(message);
    this.name = "LoadError";
    this.notFound = notFound;
  }
}

/** Relative URL of a file in a trip folder; works under any base path (SPEC section 1). */
export function tripUrl(slug: string, file: string): string {
  return `./trips/${encodeURIComponent(slug)}/${file}`;
}

/** Relative URL of a path relative to the site root (e.g. index.json covers). */
export function siteUrl(file: string): string {
  return `./${file}`;
}

async function fetchJson<T extends { schemaVersion: number }>(url: string): Promise<T> {
  let response: Response;
  try {
    // trip.json and index.json change on rebuilds; always revalidate.
    response = await fetch(url, { cache: "no-cache" });
  } catch {
    throw new LoadError(strings.networkError);
  }
  if (!response.ok) {
    throw new LoadError(
      strings.loadErrorDetail(`${response.status} ${response.statusText}`.trim()),
      response.status === 404,
    );
  }
  let data: T;
  try {
    data = (await response.json()) as T;
  } catch {
    throw new LoadError(strings.unsupportedData);
  }
  if (data.schemaVersion !== SUPPORTED_SCHEMA) throw new LoadError(strings.unsupportedData);
  return data;
}

// Loaded data is kept for the session, so moving between days doesn't refetch.
const cache = new Map<string, Promise<unknown>>();

function load<T extends { schemaVersion: number }>(url: string): Promise<T> {
  let promise = cache.get(url) as Promise<T> | undefined;
  if (!promise) {
    promise = fetchJson<T>(url);
    cache.set(url, promise);
    promise.catch(() => cache.delete(url)); // allow retrying
  }
  return promise;
}

/** For tests. */
export function clearDataCache() {
  cache.clear();
}

export type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; error: LoadError; retry: () => void }
  | { status: "ready"; data: T };

function useLoad<T extends { schemaVersion: number }>(url: string): LoadState<T> {
  const [state, setState] = useState<{ url: string; state: LoadState<T> }>({
    url,
    state: { status: "loading" },
  });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    load<T>(url).then(
      (data) => !cancelled && setState({ url, state: { status: "ready", data } }),
      (error: unknown) =>
        !cancelled &&
        setState({
          url,
          state: {
            status: "error",
            error: error instanceof LoadError ? error : new LoadError(String(error)),
            retry,
          },
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [url, attempt, retry]);

  // A state for a previous URL is stale; show loading until the new one arrives.
  return state.url === url ? state.state : { status: "loading" };
}

export function useTripIndex(): LoadState<TripIndex> {
  return useLoad<TripIndex>("./trips/index.json");
}

export function useTrip(slug: string): LoadState<Trip> {
  return useLoad<Trip>(tripUrl(slug, "trip.json"));
}
