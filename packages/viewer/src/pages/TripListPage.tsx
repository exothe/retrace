import { Link } from "react-router";
import type { TripSummary } from "@retrace/shared";
import { ErrorMessage, Loading, Page } from "../components/Page.tsx";
import { useDocumentTitle } from "../hooks.ts";
import { siteUrl, useTripIndex } from "../data.ts";
import { formatDateRange } from "../format.ts";
import { strings } from "../strings.ts";

export function TripListPage() {
  const state = useTripIndex();
  useDocumentTitle(undefined);
  return (
    <Page wide>
      <h1 className="mt-4 mb-6 text-3xl font-semibold tracking-tight">{strings.tripListTitle}</h1>
      {state.status === "loading" && <Loading />}
      {state.status === "error" && (
        <ErrorMessage
          title={strings.indexLoadError}
          detail={state.error.message}
          retry={state.retry}
        />
      )}
      {state.status === "ready" &&
        (state.data.trips.length === 0 ? (
          <p className="py-16 text-center text-zinc-500">{strings.noTrips}</p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {state.data.trips.map((trip) => (
              <li key={trip.slug}>
                <TripCard trip={trip} />
              </li>
            ))}
          </ul>
        ))}
    </Page>
  );
}

function TripCard({ trip }: { trip: TripSummary }) {
  return (
    <Link to={`/${encodeURIComponent(trip.slug)}`} className="group block">
      <div
        className="aspect-[3/2] overflow-hidden rounded-xl bg-zinc-200 dark:bg-zinc-800"
        style={trip.cover?.color ? { backgroundColor: trip.cover.color } : undefined}
      >
        {trip.cover && (
          <img
            src={siteUrl(trip.cover.thumb)}
            srcSet={`${siteUrl(trip.cover.thumb)} 400w, ${siteUrl(trip.cover.display)} 1920w`}
            sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        )}
      </div>
      <h2 className="mt-3 text-lg font-semibold group-hover:underline">{trip.title}</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {formatDateRange(trip.startDate, trip.endDate)}
      </p>
      <p className="mt-0.5 text-sm text-zinc-500">
        {[
          strings.days(trip.dayCount),
          strings.photos(trip.photoCount),
          ...(trip.videoCount > 0 ? [strings.videos(trip.videoCount)] : []),
        ].join(" · ")}
      </p>
    </Link>
  );
}
