import { describe, expect, it } from "vitest";
import { isValidTransition, nextStatuses } from "./state-machine";

describe("booking state machine", () => {
  it("walks the happy path requested -> completed", () => {
    const path = ["requested", "assigned", "en_route", "arrived", "charging", "completed"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(isValidTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it("allows assigned -> requested (decline/reassign) and nothing past completed", () => {
    expect(isValidTransition("assigned", "requested")).toBe(true);
    expect(isValidTransition("completed", "cancelled")).toBe(false);
    expect(isValidTransition("cancelled", "requested")).toBe(false);
  });

  it("cancels from pre-charging states only", () => {
    expect(isValidTransition("requested", "cancelled")).toBe(true);
    expect(isValidTransition("en_route", "cancelled")).toBe(true);
    expect(isValidTransition("charging", "cancelled")).toBe(false);
  });

  it("expires only from requested and fails from active states", () => {
    expect(isValidTransition("requested", "expired")).toBe(true);
    expect(isValidTransition("assigned", "expired")).toBe(false);
    expect(isValidTransition("requested", "failed")).toBe(true);
    expect(isValidTransition("completed", "failed")).toBe(false);
  });

  it("lists next statuses for requested", () => {
    expect(nextStatuses("requested").sort()).toEqual(
      ["assigned", "cancelled", "expired", "failed"].sort(),
    );
  });
});
