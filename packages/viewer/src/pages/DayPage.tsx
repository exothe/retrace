import { useCallback, useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import type { Day, Media, TimelineItem, Track, Trip } from "@retrace/shared";
import { DayMap } from "../components/DayMap.tsx";
import { MediaGrid } from "../components/MediaGrid.tsx";
import { TrackCard } from "../components/TrackCard.tsx";
import { MediaLightbox } from "../components/MediaLightbox.tsx";
import { toSlide } from "../slides.ts";
import { ErrorMessage, Loading, Page } from "../components/Page.tsx";
import { useDocumentTitle } from "../hooks.ts";
import { ChevronLeftIcon, ChevronRightIcon } from "../components/icons.tsx";
import { useTrip } from "../data.ts";
import { formatLongDate } from "../format.ts";
import { dayMediaIds, entryByMediaId } from "../media.ts";
import { strings } from "../strings.ts";

/** Location state set when the lightbox is opened from within the page. */
interface OpenedHere {
  openedHere: true;
}

export function DayPage() {
  const { slug = "", date = "" } = useParams();
  const state = useTrip(slug);
  return (
    <Page
      back={{
        to: `/${encodeURIComponent(slug)}`,
        label: strings.backToDays,
        state: { fromDate: date },
      }}
    >
      {state.status === "loading" && <Loading />}
      {state.status === "error" && (
        <ErrorMessage
          title={state.error.notFound ? strings.tripNotFound : strings.tripLoadError}
          detail={state.error.message}
          {...(!state.error.notFound && { retry: state.retry })}
        />
      )}
      {state.status === "ready" && <DayView trip={state.data} date={date} />}
    </Page>
  );
}

function DayView({ trip, date }: { trip: Trip; date: string }) {
  const { mediaId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dayIndex = trip.days.findIndex((d) => d.date === date);
  const day = trip.days[dayIndex];
  useDocumentTitle(day ? `${formatLongDate(day.date)} · ${trip.title}` : trip.title);

  const base = `/${encodeURIComponent(trip.slug)}`;
  const dayPath = `${base}/${date}`;
  const previous = trip.days[dayIndex - 1];
  const next = trip.days[dayIndex + 1];

  const { ids, slides } = useMemo(() => {
    if (!day) return { ids: [], slides: [] };
    const ids = dayMediaIds(day, trip);
    const entries = entryByMediaId(day);
    return { ids, slides: ids.map((id) => toSlide(trip.slug, trip.media[id]!, entries.get(id))) };
  }, [day, trip]);
  const lightboxIndex = mediaId === undefined ? -1 : ids.indexOf(mediaId);

  // Opens the lightbox; a pin of a track that crosses midnight may show media of another day.
  const open = useCallback(
    (id: string) => {
      const owner = ids.includes(id)
        ? day
        : trip.days.find((d) => dayMediaIds(d, trip).includes(id));
      if (!owner) return;
      navigate(`${base}/${owner.date}/${id}`, {
        state: { openedHere: true } satisfies OpenedHere,
      });
    },
    [navigate, base, ids, day, trip],
  );
  const view = useCallback(
    (index: number) =>
      navigate(`${dayPath}/${ids[index]}`, { replace: true, state: location.state }),
    [navigate, dayPath, ids, location.state],
  );
  // Back closes the lightbox when it was opened here; a deep link closes to the day route.
  const close = useCallback(() => {
    if ((location.state as OpenedHere | null)?.openedHere) navigate(-1);
    else navigate(dayPath, { replace: true });
  }, [navigate, dayPath, location.state]);

  // New day: start at the top.
  useEffect(() => {
    // Braces matter: scrollTo returns a Promise in current browsers, and React would call a
    // returned value as the effect's cleanup.
    window.scrollTo(0, 0);
  }, [date]);

  // Arrow keys switch days while the lightbox is closed (it handles them itself when open).
  useEffect(() => {
    if (lightboxIndex >= 0) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select"))
        return;
      const target =
        event.key === "ArrowLeft" ? previous : event.key === "ArrowRight" ? next : undefined;
      if (target) {
        event.preventDefault();
        navigate(`${base}/${target.date}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, previous, next, navigate, base]);

  if (!day) return <ErrorMessage title={strings.dayNotFound} />;

  return (
    <>
      <header className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-2 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <DayNavButton to={previous && `${base}/${previous.date}`} label={strings.previousDay}>
          <ChevronLeftIcon />
        </DayNavButton>
        <h1 className="min-w-0 flex-1 text-center text-lg leading-tight font-semibold">
          {formatLongDate(day.date)}
          <span className="block truncate text-sm font-normal text-zinc-500">{trip.title}</span>
        </h1>
        <DayNavButton to={next && `${base}/${next.date}`} label={strings.nextDay}>
          <ChevronRightIcon />
        </DayNavButton>
      </header>

      {!day.hasNotes && (
        <p className="mb-4 text-sm text-zinc-500 italic">{strings.mediaOnlyNote}</p>
      )}
      {day.mapMediaIds.length > 0 && <DayMap day={day} trip={trip} onOpenMedia={open} />}
      <Timeline day={day} trip={trip} onOpen={open} />

      <MediaLightbox slides={slides} index={lightboxIndex} onView={view} onClose={close} />
    </>
  );
}

function Timeline({ day, trip, onOpen }: { day: Day; trip: Trip; onOpen: (id: string) => void }) {
  return (
    <ol className="relative space-y-6 border-l border-zinc-200 pl-5 dark:border-zinc-800">
      {day.before.length > 0 && (
        <li className="relative">
          <Dot muted />
          {day.hasNotes && <p className="mb-2 text-sm text-zinc-500">{strings.beforeFirstEntry}</p>}
          <Items items={day.before} trip={trip} onOpen={onOpen} />
        </li>
      )}
      {day.entries.map((entry) => (
        <li key={entry.id} className="relative">
          <Dot />
          <p className="leading-snug">
            <time
              dateTime={entry.timestamp}
              className="mr-2 font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
            >
              {entry.time}
            </time>
            <span className="whitespace-pre-wrap">{entry.text}</span>
          </p>
          {entry.items.length > 0 && (
            <div className="mt-2.5">
              <Items items={entry.items} trip={trip} onOpen={onOpen} />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Items in time order: runs of media as one grid, tracks as cards between them. */
function Items({
  items,
  trip,
  onOpen,
}: {
  items: TimelineItem[];
  trip: Trip;
  onOpen: (id: string) => void;
}) {
  const groups: ({ kind: "media"; media: Media[] } | { kind: "track"; track: Track })[] = [];
  for (const item of items) {
    if (item.kind === "track") {
      const track = trip.tracks[item.id];
      if (track) groups.push({ kind: "track", track });
      continue;
    }
    const media = trip.media[item.id];
    if (!media) continue;
    const last = groups.at(-1);
    if (last?.kind === "media") last.media.push(media);
    else groups.push({ kind: "media", media: [media] });
  }
  return (
    <div className="space-y-3">
      {groups.map((group) =>
        group.kind === "track" ? (
          <TrackCard
            key={group.track.id}
            slug={trip.slug}
            track={group.track}
            media={trip.media}
            onOpenMedia={onOpen}
          />
        ) : (
          <MediaGrid
            key={group.media[0]!.id}
            slug={trip.slug}
            media={group.media}
            onOpen={onOpen}
          />
        ),
      )}
    </div>
  );
}

function Dot({ muted = false }: { muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full ring-4 ring-white dark:ring-zinc-950 ${
        muted ? "bg-zinc-300 dark:bg-zinc-700" : "bg-sky-600 dark:bg-sky-400"
      }`}
    />
  );
}

function DayNavButton({
  to,
  label,
  children,
}: {
  to: string | undefined;
  label: string;
  children: React.ReactNode;
}) {
  const className = "flex size-10 shrink-0 items-center justify-center rounded-full";
  if (!to)
    return (
      <span className={`${className} text-zinc-300 dark:text-zinc-700`} aria-hidden="true">
        {children}
      </span>
    );
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className={`${className} hover:bg-zinc-100 dark:hover:bg-zinc-800`}
    >
      {children}
    </Link>
  );
}
