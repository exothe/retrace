import { useId, useRef } from "react";
import type { ElevationPoint } from "@retrace/shared";
import { formatKilometers, formatMeters } from "../format.ts";
import { strings } from "../strings.ts";

const WIDTH = 600;
const HEIGHT = 120;
const PAD = { top: 8, right: 4, bottom: 18, left: 4 };

/**
 * Elevation over distance as a small SVG (SPEC section 10.5). Hovering or touching reports the
 * distance under the pointer, so the map can show that position.
 */
export function ElevationProfile({
  profile,
  hoverDistance,
  onHover,
}: {
  profile: ElevationPoint[];
  hoverDistance: number | undefined;
  onHover: (distance: number | undefined) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const gradientId = useId();
  if (profile.length < 2) return null;

  const total = profile.at(-1)![0] || 1;
  const elevations = profile.map((p) => p[1]);
  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  const range = Math.max(max - min, 20); // flat tracks shouldn't look dramatic
  const x = (d: number) => PAD.left + (d / total) * (WIDTH - PAD.left - PAD.right);
  const y = (e: number) => PAD.top + (1 - (e - min) / range) * (HEIGHT - PAD.top - PAD.bottom);
  const line = profile
    .map(([d, e], i) => `${i === 0 ? "M" : "L"}${x(d).toFixed(1)},${y(e).toFixed(1)}`)
    .join("");
  const area = `${line}L${x(total).toFixed(1)},${HEIGHT - PAD.bottom}L${x(0).toFixed(1)},${HEIGHT - PAD.bottom}Z`;

  const pointerDistance = (event: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const fraction = (event.clientX - rect.left) / rect.width;
    const plotFraction = (fraction * WIDTH - PAD.left) / (WIDTH - PAD.left - PAD.right);
    return Math.min(total, Math.max(0, plotFraction * total));
  };
  const hover = hoverDistance === undefined ? undefined : nearest(profile, hoverDistance);

  return (
    <figure className="select-none">
      <svg
        ref={ref}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-24 w-full touch-none text-sky-600 dark:text-sky-400"
        role="img"
        aria-label={`${strings.elevationProfile}: ${strings.elevationRange(formatMeters(min).replace(" m", ""), formatMeters(max).replace(" m", ""))}`}
        preserveAspectRatio="none"
        onPointerMove={(e) => onHover(pointerDistance(e))}
        onPointerDown={(e) => onHover(pointerDistance(e))}
        onPointerLeave={() => onHover(undefined)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {hover && (
          <line
            x1={x(hover[0])}
            x2={x(hover[0])}
            y1={PAD.top}
            y2={HEIGHT - PAD.bottom}
            className="stroke-amber-500"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <figcaption className="mt-0.5 flex justify-between text-xs text-zinc-500 tabular-nums">
        <span>
          {strings.elevationRange(
            formatMeters(min).replace(" m", ""),
            formatMeters(max).replace(" m", ""),
          )}
        </span>
        {hover ? (
          <span className="text-amber-600 dark:text-amber-400">
            {formatKilometers(hover[0])} · {formatMeters(hover[1])}
          </span>
        ) : (
          <span>{formatKilometers(total)}</span>
        )}
      </figcaption>
    </figure>
  );
}

function nearest(profile: ElevationPoint[], distance: number): ElevationPoint {
  let best = profile[0]!;
  for (const p of profile) if (Math.abs(p[0] - distance) < Math.abs(best[0] - distance)) best = p;
  return best;
}
