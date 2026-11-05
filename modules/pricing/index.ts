export type ChargeEstimateInput = {
  baseFeePaise: number;
  perKwhPaise: number;
  vehicleBatteryKwh: number;
  batteryPercent: number;
  targetPercent?: number;
};

export type ChargeEstimate = {
  estimatedKwh: number;
  estimatedTotalPaise: number;
};

const DEFAULT_TARGET_PERCENT = 80;

export function estimateCharge(input: ChargeEstimateInput): ChargeEstimate {
  const { baseFeePaise, perKwhPaise, vehicleBatteryKwh, batteryPercent } = input;
  const target = input.targetPercent ?? DEFAULT_TARGET_PERCENT;

  if (!Number.isInteger(baseFeePaise) || baseFeePaise < 0) {
    throw new Error("baseFeePaise must be a non-negative integer");
  }
  if (!Number.isInteger(perKwhPaise) || perKwhPaise <= 0) {
    throw new Error("perKwhPaise must be a positive integer");
  }
  if (!(vehicleBatteryKwh > 0)) throw new Error("vehicleBatteryKwh must be positive");
  if (batteryPercent < 0 || batteryPercent > 100) {
    throw new Error("batteryPercent must be 0-100");
  }
  if (target < 0 || target > 100) throw new Error("targetPercent must be 0-100");
  if (target <= batteryPercent) throw new Error("targetPercent must exceed batteryPercent");

  const estimatedKwh = Number(
    (((target - batteryPercent) / 100) * vehicleBatteryKwh).toFixed(2),
  );
  const estimatedTotalPaise = baseFeePaise + Math.round(estimatedKwh * perKwhPaise);

  return { estimatedKwh, estimatedTotalPaise };
}

/** Final amount from an actual delivered kWh (server-only). */
export function finalCharge(baseFeePaise: number, perKwhPaise: number, deliveredKwh: number): number {
  if (!Number.isInteger(baseFeePaise) || baseFeePaise < 0) throw new Error("baseFeePaise must be a non-negative integer");
  if (!Number.isInteger(perKwhPaise) || perKwhPaise <= 0) throw new Error("perKwhPaise must be a positive integer");
  if (!(deliveredKwh > 0)) throw new Error("deliveredKwh must be positive");
  return baseFeePaise + Math.round(deliveredKwh * perKwhPaise);
}
