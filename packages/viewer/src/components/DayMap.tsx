import { useId, useState } from "react";
import type { Day, Trip } from "@retrace/shared";
import { strings } from "../strings.ts";
import { pinsFor, routeOf } from "../tracks.ts";
import { MapView } from "./MapView.tsx";
import { ChevronRightIcon } from "./icons.tsx";

/** Collapsible map of the day's geotagged media and tracks, collapsed by default (SPEC 10.5). */
export function DayMap({
  day,
  trip,
  onOpenMedia,
}: {
  day: Day;
  trip: Trip;
  onOpenMedia: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trackIds = [...day.before, ...day.entries.flatMap((e) => e.items)]
    .filter((item) => item.kind === "track")
    .map((item) => item.id);
  const routes = trackIds.flatMap((t) => (trip.tracks[t] ? [routeOf(trip.tracks[t])] : []));
  return (
    <section className="mb-5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-sm font-medium text-sky-700 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300"
      >
        <ChevronRightIcon className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} />
        {open ? strings.hideMap : strings.showMap}
      </button>
      {open && (
        <div id={id} role="region" aria-label={strings.dayMap}>
          <MapView
            className="mt-2 h-72 sm:h-96"
            routes={routes}
            pins={pinsFor(trip.slug, day.mapMediaIds, trip.media)}
            onPinClick={onOpenMedia}
          />
        </div>
      )}
    </section>
  );
}
