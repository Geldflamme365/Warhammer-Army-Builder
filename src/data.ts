import type { CatalogueIndex, FactionData, FactionMeta } from "./types";

const DATA_ROOT = "/bsdata";

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load ${path} (${response.status})`);
  }
  return (await response.json()) as T;
}

export function loadCatalogueIndex(signal?: AbortSignal): Promise<CatalogueIndex> {
  return fetchJson<CatalogueIndex>(`${DATA_ROOT}/index.json`, signal);
}

export function loadFactionCatalogue(meta: FactionMeta, signal?: AbortSignal): Promise<FactionData> {
  return fetchJson<FactionData>(`${DATA_ROOT}/${meta.path}`, signal);
}
