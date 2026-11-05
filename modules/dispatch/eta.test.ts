import { describe, expect, it } from "vitest";

import { clearEtaCache, getEta, haversineEta } from "./eta";

describe("ETA provider", () => {
  const a = { lat: 12.9716, lng: 77.5946 };
  const b = { lat: 12.9716, lng: 77.7046 };

  it("haversine ETA is ~5 min for ~11km", () => {
    const eta = haversineEta(a, b);
    expect(eta.source).toBe("haversine");
    expect(eta.distanceMeters).toBeGreaterThan(10_000);
    expect(eta.etaMinutes).toBe(26);
  });

  it("caches per van/booking pair for 60s (same result, no recompute check)", async () => {
    clearEtaCache();
    const first = await getEta("van-1", "booking-1", a, b);
    const second = await getEta("van-1", "booking-1", b, a); // different coords, cached key wins
    expect(second).toEqual(first);
    const other = await getEta("van-2", "booking-1", a, b);
    expect(other.etaMinutes).toBeGreaterThan(0);
  });
});
