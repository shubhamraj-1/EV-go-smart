export type BookingStatus =
  | "requested"
  | "assigned"
  | "en_route"
  | "arrived"
  | "charging"
  | "completed"
  | "cancelled"
  | "expired"
  | "failed";

export const ACTIVE_STATUSES: readonly BookingStatus[] = [
  "requested",
  "assigned",
  "en_route",
  "arrived",
  "charging",
];

type TransitionRule = {
  from: readonly BookingStatus[];
  to: BookingStatus;
};

const RULES: TransitionRule[] = [
  { from: ["requested"], to: "assigned" },
  { from: ["assigned"], to: "en_route" },
  { from: ["assigned"], to: "requested" },
  { from: ["en_route"], to: "arrived" },
  { from: ["arrived"], to: "charging" },
  { from: ["charging"], to: "completed" },
  { from: ["requested", "assigned", "en_route", "arrived"], to: "cancelled" },
  { from: ["requested"], to: "expired" },
  { from: ACTIVE_STATUSES, to: "failed" },
];

export function isValidTransition(from: BookingStatus, to: BookingStatus): boolean {
  return RULES.some((r) => r.to === to && r.from.includes(from));
}

export function nextStatuses(from: BookingStatus): BookingStatus[] {
  return RULES.filter((r) => r.from.includes(from)).map((r) => r.to);
}
