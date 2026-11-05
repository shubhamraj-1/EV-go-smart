import { Truck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MapVariant = "hero" | "tracking";

type Road = {
  d: string;
  width: number;
  tone: "base" | "light";
};

type MapGeometry = {
  width: number;
  height: number;
  viewBox: string;
  parks: { x: number; y: number; width: number; height: number; rx: number }[];
  water: string;
  roads: Road[];
  route: string;
};

/**
 * Two hand-drawn map plates from the Calm Confidence direction.
 * `hero` is the 440×186 card on the landing page; `tracking` is the
 * 720×300 live-booking plate.
 */
const MAPS = {
  hero: {
    width: 440,
    height: 186,
    viewBox: "0 0 440 186",
    parks: [{ x: 16, y: 16, width: 92, height: 56, rx: 9 }],
    water: "M322-12c32 38 60 44 72 88s-14 76-8 122h66V-12Z",
    roads: [
      { d: "M-24 158C74 136 118 76 214 70s158-8 250-44", width: 12, tone: "base" },
      { d: "M-14 34 456 156", width: 8, tone: "base" },
      { d: "M-24 158C74 136 118 76 214 70s158-8 250-44", width: 4, tone: "light" },
      { d: "M72-12 102 206", width: 4, tone: "base" },
      { d: "M338-12 304 206", width: 4, tone: "base" },
      { d: "M-12 104 456 86", width: 4, tone: "base" },
    ],
    route: "M72 146c34-16 48-44 92-48s64-25 104-23 46-16 82-30",
  },
  tracking: {
    width: 720,
    height: 300,
    viewBox: "0 0 720 300",
    parks: [
      { x: 28, y: 26, width: 148, height: 86, rx: 12 },
      { x: 532, y: 188, width: 150, height: 84, rx: 12 },
    ],
    water: "M540-20c38 52 76 64 88 122s-16 100-8 158h112V-20Z",
    roads: [
      { d: "M-30 246C116 214 180 118 336 112s250-8 414-58", width: 16, tone: "base" },
      { d: "M-20 62 744 236", width: 10, tone: "base" },
      { d: "M-20 62 744 236", width: 6, tone: "base" },
      { d: "M-30 246C116 214 180 118 336 112s250-8 414-58", width: 5, tone: "light" },
      { d: "M122-20 164 320", width: 6, tone: "base" },
      { d: "M474-20 430 320", width: 6, tone: "base" },
      { d: "M-20 168 744 140", width: 6, tone: "base" },
      { d: "M-20 292 744 282", width: 6, tone: "base" },
    ],
    route: "M120 246c56-24 78-72 148-80s98-46 158-44 82-22 134-44",
  },
} satisfies Record<MapVariant, MapGeometry>;

type IllustrativeMapProps = {
  variant?: MapVariant;
  className?: string;
  /** Pins, labels, and ETA rings, positioned over the plate. */
  children?: ReactNode;
};

/**
 * Decorative map plate for marketing and demo screens. No network, no
 * Google Maps SDK — the real map is a separate, lazy-loaded client component.
 */
export function IllustrativeMap({
  variant = "hero",
  className,
  children,
}: IllustrativeMapProps) {
  const map = MAPS[variant];

  return (
    <div className={cn("relative isolate overflow-hidden bg-map-bg", className)}>
      <svg
        viewBox={map.viewBox}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        className="block size-full"
      >
        <rect width={map.width} height={map.height} className="fill-map-bg" />

        {map.parks.map((park) => (
          <rect
            key={`${park.x}-${park.y}`}
            x={park.x}
            y={park.y}
            width={park.width}
            height={park.height}
            rx={park.rx}
            className="fill-map-park opacity-85"
          />
        ))}

        <path d={map.water} className="fill-map-water opacity-70" />

        {map.roads.map((road, index) => (
          <path
            key={index}
            d={road.d}
            strokeWidth={road.width}
            strokeLinecap="round"
            fill="none"
            className={road.tone === "base" ? "stroke-map-road" : "stroke-map-road-2"}
          />
        ))}

        <path
          d={map.route}
          strokeWidth={9}
          strokeLinecap="round"
          fill="none"
          className="stroke-white/85"
        />
        <path
          d={map.route}
          strokeWidth={4.2}
          strokeLinecap="round"
          strokeDasharray="1 9"
          fill="none"
          className="stroke-accent"
        />
      </svg>

      {children}
    </div>
  );
}

type MapPinProps = {
  kind: "van" | "dest" | "request";
  left: string;
  top: string;
  className?: string;
};

export function MapPin({ kind, left, top, className }: MapPinProps) {
  return (
    <span
      aria-hidden="true"
      style={{ left, top }}
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2",
        kind === "van" &&
          "grid size-[34px] place-items-center rounded-[9px] bg-ink text-white shadow-pin",
        kind === "dest" && "size-[15px] rounded-full bg-accent ring-[5px] ring-accent/17",
        kind === "request" && "size-3.5 rounded-full bg-amber ring-[5px] ring-amber/16",
        className,
      )}
    >
      {kind === "van" ? (
        <Truck className="size-[18px]" strokeWidth={1.8} />
      ) : null}
    </span>
  );
}

type MapLabelProps = {
  children: ReactNode;
  left: string;
  top: string;
  className?: string;
};

export function MapLabel({ children, left, top, className }: MapLabelProps) {
  return (
    <span
      aria-hidden="true"
      style={{ left, top }}
      className={cn(
        "absolute rounded-md border border-ink/7 bg-white/94 px-2 py-1 text-[10.5px] font-bold whitespace-nowrap text-ink shadow-[0_4px_10px_rgb(18_36_28/0.08)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

type EtaRingProps = {
  minutes: number;
  className?: string;
};

/** Decorative conic ring for the illustrative tracking card. */
export function EtaRing({ minutes, className }: EtaRingProps) {
  return (
    <div aria-hidden="true" className={cn("eta-ring", className)}>
      <span className="grid place-content-center text-center leading-none">
        <b className="text-[21px] font-extrabold tracking-[-.05em]">{minutes}</b>
        <small className="mt-[3px] block text-[8.5px] font-bold tracking-[.12em] text-subtle uppercase">
          min
        </small>
      </span>
    </div>
  );
}
