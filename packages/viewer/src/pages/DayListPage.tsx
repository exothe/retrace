import { useEffect } from "react";
import { Link, useLocation, useParams } from "react-router";
import type { Day, Trip } from "@retrace/shared";
import { ErrorMessage, Loading, Page } from "../components/Page.tsx";
import { useDocumentTitle } from "../hooks.ts";
import { RouteIcon } from "../components/icons.tsx";
import { tripUrl, useTrip } from "../data.ts";
import { formatDateRange, formatDayMonth, formatWeekday } from "../format.ts";
import { dayStats, thumbPath } from "../media.ts";
import { strings } from "../strings.ts";

const STRIP_LENGTH = 8;

export function DayListPage() {
  const { slug = "" } = useParams();
  const state = useTrip(slug);
  const location = useLocation();
  const fromDate = (location.state as { fromDate?: string } | null)?.fromDate;
  useDocumentTitle(state.status === "ready" ? state.data.title : undefined);

  // Coming back from a day: keep that day in view instead of jumping to the top.
  useEffect(() => {
    if (state.status === "ready" && fromDate) {
      document.getElementById(`day-${fromDate}`)?.scrollIntoView({ block: "center" });
    }
  }, [state.status, fromDate]);

  return (
    <Page back={{ to: "/", label: strings.backToTrips }}>
      {state.status === "loading" && <Loading />}
      {state.status === "error" && (
        <ErrorMessage
          title={state.error.notFound ? strings.tripNotFound : strings.tripLoadError}
          detail={state.error.message}
          {...(!state.error.notFound && { retry: state.retry })}
        />
      )}
      {state.status === "ready" && <DayList trip={state.data} />}
    </Page>
  );
}

function DayList({ trip }: { trip: Trip }) {
  const photos = Object.values(trip.media).filter((m) => m.type === "photo").length;
  const videos = Object.keys(trip.media).length - photos;
  return (
    <>
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{trip.title}</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          {formatDateRange(trip.startDate, trip.endDate)}
          {" · "}
          {[
            strings.days(trip.days.length),
            strings.photos(photos),
            ...(videos > 0 ? [strings.videos(videos)] : []),
          ].join(" · ")}
        </p>
      </header>
      <ol className="space-y-3">
        {trip.days.map((day) => (
          <li key={day.date} id={`day-${day.date}`}>
            <DayCard trip={trip} day={day} />
          </li>
        ))}
      </ol>
    </>
  );
}

function DayCard({ trip, day }: { trip: Trip; day: Day }) {
  const stats = dayStats(day, trip);
  const preview = day.entries.slice(0, 2);
  const counts = [
    ...(stats.photos > 0 ? [strings.photos(stats.photos)] : []),
    ...(stats.videos > 0 ? [strings.videos(stats.videos)] : []),
  ];
  return (
    <Link
      to={`/${encodeURIComponent(trip.slug)}/${day.date}`}
      className={`block rounded-xl border p-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
        day.hasNotes
          ? "border-zinc-200 dark:border-zinc-800"
          : "border-dashed border-zinc-300 dark:border-zinc-700"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">
          {formatWeekday(day.date)}
          <span className="font-normal text-zinc-600 dark:text-zinc-400">
            , {formatDayMonth(day.date)}
          </span>
        </h2>
        <span className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
          {stats.tracks > 0 && (
            <span title={strings.hasTrack} aria-label={strings.hasTrack}>
              <RouteIcon className="size-4" />
            </span>
          )}
          {!day.hasNotes && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
              {strings.mediaOnlyBadge}
            </span>
          )}
        </span>
      </div>
      {preview.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-sm text-zinc-700 dark:text-zinc-300">
          {preview.map((entry) => (
            <li key={entry.id} className="line-clamp-1">
              <span className="mr-1.5 text-zinc-500 tabular-nums">{entry.time}</span>
              {entry.text}
            </li>
          ))}
        </ul>
      )}
      {stats.mediaIds.length > 0 && (
        <div className="mt-3 flex gap-1 overflow-hidden" aria-hidden="true">
          {stats.mediaIds.slice(0, STRIP_LENGTH).map((id) => {
            const media = trip.media[id]!;
            return (
              <img
                key={id}
                src={tripUrl(trip.slug, thumbPath(media))}
                alt=""
                width={56}
                height={56}
                loading="lazy"
                decoding="async"
                className="size-14 shrink-0 rounded-sm object-cover"
                style={{ backgroundColor: media.color }}
              />
            );
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-zinc-500">
        {counts.length > 0 ? counts.join(" · ") : strings.noMediaYet}
      </p>
    </Link>
  );
}
