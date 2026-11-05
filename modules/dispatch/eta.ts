/**
 * EtaProvider: Google Directions top-3 when a server key is present,
 * otherwise Haversine fallback. 60s in-memory cache per van/booking pair.
 * The cache is process-local (acceptable for MVP single-instance semantics).
 * NOTE: `import "server-only"` is intentionally NOT used here so this module
 * stays unit-testable in Node (Vitest) — the only effect would be an import
 * error in client bundles, which is prevented by the runtime fetch (server key)
 * and the call sites all being server-only modules.
 */
import { haversineMeters } from "../../lib/geo";

type LatLng = { lat: number; lng: number };

export type EtaResult = {
  etaMinutes: number;
  distanceMeters: number;
  source: "google" | "haversine";
};

const cache = new Map<string, { eta: EtaResult; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

/** Straight-line ETA: ~28 km/h urban average. Fallback only — not road ETA. */
export function haversineEta(origin: LatLng, destination: LatLng): EtaResult {
  const d = haversineMeters(origin.lat, origin.lng, destination.lat, destination.lng);
  const etaMinutes = Math.max(1, Math.round((d / 1000 / 28) * 60));
  return { etaMinutes, distanceMeters: Math.round(d), source: "haversine" };
}

function cacheKey(vanId: string, bookingId: string): string {
  return `${vanId}:${bookingId}`;
}

/**
 * EtaProvider: Google Directions top-3 when a server key is present,
 * otherwise Haversine fallback. 60s in-memory cache per van/booking pair.
 * The cache is process-local (acceptable for MVP single-instance semantics).
 */
export async function getEta(
  vanId: string,
  bookingId: string,
  vanPos: LatLng,
  customerPos: LatLng,
): Promise<EtaResult> {
  const key = cacheKey(vanId, bookingId);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.eta;

  const eta = await googleEta(vanPos, customerPos).catch(() => haversineEta(vanPos, customerPos));

  cache.set(key, { eta, expiresAt: now + CACHE_TTL_MS });
  // Keep the map small.
  if (cache.size > 500) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  return eta;
}

/**
 * Google Directions (legacy API) — only called when GOOGLE_MAPS_SERVER_API_KEY is set.
 * Fail closed to Haversine in the caller, never error the dispatch loop for ETA.
 */
async function googleEta(origin: LatLng, destination: LatLng): Promise<EtaResult> {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key) return haversineEta(origin, destination);

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", key);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error("google directions failed");
  const data = (await res.json()) as {
    status?: string;
    routes?: Array<{ legs?: Array<{ duration?: { value?: number }; distance?: { value?: number } }> }>;
  };
  if (data.status !== "OK" || !data.routes?.[0]?.legs?.[0]) {
    throw new Error("google directions no route");
  }
  const leg = data.routes[0].legs[0]!;
  const durationSec = leg.duration?.value ?? 0;
  const distanceMeters = leg.distance?.value ?? 0;
  return {
    etaMinutes: Math.max(1, Math.round(durationSec / 60)),
    distanceMeters,
    source: "google",
  };
}

/** Test-only: clear the module cache. */
export function clearEtaCache(): void {
  cache.clear();
}
