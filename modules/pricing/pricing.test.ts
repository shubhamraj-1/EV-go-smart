import { describe, expect, it } from "vitest";
import { estimateCharge } from "./index";

describe("estimateCharge", () => {
  it("computes the default Bengaluru estimate (₹199 + ₹18/kWh)", () => {
    const est = estimateCharge({
      baseFeePaise: 19_900,
      perKwhPaise: 1_800,
      vehicleBatteryKwh: 40,
      batteryPercent: 20,
    });
    // 60% of 40 kWh = 24 kWh -> 24 * 18 = 432 + 199 = 631
    expect(est).toEqual({ estimatedKwh: 24, estimatedTotalPaise: 63_100 });
  });

  it("honours a custom target", () => {
    const est = estimateCharge({
      baseFeePaise: 100,
      perKwhPaise: 10,
      vehicleBatteryKwh: 10,
      batteryPercent: 10,
      targetPercent: 60,
    });
    expect(est.estimatedKwh).toBe(5);
    expect(est.estimatedTotalPaise).toBe(150);
  });

  it("rejects an unreachable target", () => {
    expect(() =>
      estimateCharge({
        baseFeePaise: 100,
        perKwhPaise: 10,
        vehicleBatteryKwh: 10,
        batteryPercent: 80,
        targetPercent: 60,
      }),
    ).toThrow();
  });

  it("rejects non-positive per-kWh", () => {
    expect(() =>
      estimateCharge({
        baseFeePaise: 100,
        perKwhPaise: 0,
        vehicleBatteryKwh: 10,
        batteryPercent: 10,
      }),
    ).toThrow();
  });

  it("rejects a negative base fee", () => {
    expect(() =>
      estimateCharge({
        baseFeePaise: -1,
        perKwhPaise: 10,
        vehicleBatteryKwh: 10,
        batteryPercent: 10,
      }),
    ).toThrow();
  });

  it("rejects out-of-range battery percent", () => {
    expect(() =>
      estimateCharge({
        baseFeePaise: 100,
        perKwhPaise: 10,
        vehicleBatteryKwh: 10,
        batteryPercent: 101,
      }),
    ).toThrow();
  });
});
