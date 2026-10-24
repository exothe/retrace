import { useState } from "react";
import type { Media, Track } from "@retrace/shared";
import { formatHours, formatKilometers, formatMeters } from "../format.ts";
import { strings } from "../strings.ts";
import { pinsFor, positionAtFraction, routeOf, sportLabel } from "../tracks.ts";
import { ElevationProfile } from "./ElevationProfile.tsx";
import { MapView } from "./MapView.tsx";
import { RouteIcon } from "./icons.tsx";

/** A GPS track in the timeline (SPEC section 10.5): times, stats, map, elevation profile. */
export function TrackCard({
  slug,
  track,
  media,
  onOpenMedia,
}: {
  slug: string;
  track: Track;
  media: Record<string, Media>;
  onOpenMedia: (id: string) => void;
}) {
  const [hoverDistance, setHoverDistance] = useState<number | undefined>();
  const { stats } = track;
  const totalProfile = track.elevationProfile.at(-1)?.[0] ?? 0;
  const highlight =
    hoverDistance === undefined || totalProfile === 0
      ? undefined
      : positionAtFraction(track.points, hoverDistance / totalProfile);

  const facts: [string, string][] = [
    [strings.distance, formatKilometers(stats.distanceMeters)],
    [
      strings.duration,
      formatHours(stats.durationSeconds) +
        (stats.movingSeconds !== undefined && stats.movingSeconds < stats.durationSeconds - 60
          ? ` (${formatHours(stats.movingSeconds)} ${strings.moving})`
          : ""),
    ],
    ...(stats.ascentMeters !== undefined
      ? [[strings.ascent, `↑ ${formatMeters(stats.ascentMeters)}`] as [string, string]]
      : []),
    ...(stats.descentMeters !== undefined
      ? [[strings.descent, `↓ ${formatMeters(stats.descentMeters)}`] as [string, string]]
      : []),
  ];

  return (
    <section
      className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
      aria-label={sportLabel(track.sport)}
    >
      <header className="flex items-center gap-2">
        <RouteIcon className="size-5 text-sky-600 dark:text-sky-400" />
        <h3 className="font-semibold">{sportLabel(track.sport)}</h3>
        <span className="text-sm text-zinc-500 tabular-nums">
          {strings.trackTime(track.localStart, track.localEnd)}
        </span>
      </header>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-zinc-500">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <MapView
        className="mt-3 h-56 sm:h-72"
        routes={[routeOf(track)]}
        pins={pinsFor(slug, track.mediaIds, media)}
        highlight={highlight}
        onPinClick={onOpenMedia}
      />
      {track.elevationProfile.length > 1 && (
        <div className="mt-2">
          <ElevationProfile
            profile={track.elevationProfile}
            hoverDistance={hoverDistance}
            onHover={setHoverDistance}
          />
        </div>
      )}
    </section>
  );
}
