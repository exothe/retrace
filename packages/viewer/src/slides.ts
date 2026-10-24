import type { Entry, Media } from "@retrace/shared";
import type { Slide } from "yet-another-react-lightbox";
// Registers the slide `title`/`description` fields.
import type {} from "yet-another-react-lightbox/plugins/captions";
import { tripUrl } from "./data.ts";
import { mediaAlt } from "./media.ts";
import { strings } from "./strings.ts";

/** A lightbox slide; the caption is the local time plus the text of the item's entry. */
export function toSlide(slug: string, media: Media, entry: Entry | undefined): Slide {
  const caption = {
    title: `${media.localTime} ${strings.timeSuffix}`,
    ...(entry && { description: entry.text }),
  };
  if (media.type === "video") {
    return {
      type: "video",
      poster: tripUrl(slug, media.poster),
      width: media.width,
      height: media.height,
      sources: [{ src: tripUrl(slug, media.src), type: "video/mp4" }],
      ...caption,
    };
  }
  return {
    src: tripUrl(slug, media.display),
    alt: mediaAlt(media),
    width: media.width,
    height: media.height,
    ...caption,
  };
}
