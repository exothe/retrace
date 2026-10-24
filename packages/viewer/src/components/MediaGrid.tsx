import type { Media } from "@retrace/shared";
import { tripUrl } from "../data.ts";
import { formatDuration } from "../format.ts";
import { mediaAlt, thumbPath } from "../media.ts";
import { strings } from "../strings.ts";
import { PlayIcon } from "./icons.tsx";

/**
 * Justified rows of thumbnails that keep each item's aspect ratio (SPEC section 10.5), done with
 * flexbox alone: each item grows in proportion to its aspect ratio, so a row fills the width
 * at equal heights. The trailing pseudo-element soaks up the last row's free space.
 */
export function MediaGrid({
  slug,
  media,
  onOpen,
}: {
  slug: string;
  media: Media[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 [--row:7rem] after:grow-[1000] after:content-[''] sm:[--row:9.5rem]">
      {media.map((m) => {
        const ratio = m.width / m.height;
        const alt = mediaAlt(m);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onOpen(m.id)}
            aria-label={strings.openMedia(alt)}
            className="group relative overflow-hidden rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
            style={{
              flexGrow: ratio,
              flexBasis: `calc(var(--row) * ${ratio})`,
              aspectRatio: `${m.width} / ${m.height}`,
              maxHeight: "calc(var(--row) * 2)",
              backgroundColor: m.color,
            }}
          >
            <img
              src={tripUrl(slug, thumbPath(m))}
              alt={alt}
              width={m.width}
              height={m.height}
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
            {m.type === "video" && (
              <span className="pointer-events-none absolute inset-0 flex items-end justify-between bg-gradient-to-t from-black/50 via-transparent to-transparent p-1.5 text-xs font-medium text-white">
                <PlayIcon className="size-5 drop-shadow" />
                <span className="tabular-nums drop-shadow">
                  {formatDuration(m.durationSeconds)}
                </span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
