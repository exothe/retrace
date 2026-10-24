import { useEffect, useSyncExternalStore } from "react";
import Lightbox from "yet-another-react-lightbox";
import type { Slide } from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Video from "yet-another-react-lightbox/plugins/video";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import { strings } from "../strings.ts";

const MAX_ZOOM = 10;
/** The lightbox's default `carousel.padding` around each slide. */
const SLIDE_PADDING = 16;
/** Pointer movement in pixels after which a click on a video counts as the end of a drag. */
const DRAG_THRESHOLD = 5;

/**
 * Lightbox over all media of a day (SPEC section 10.6). Controlled by the route: `index` comes
 * from the URL, and moving to another slide or closing changes the URL.
 */
export function MediaLightbox({
  slides,
  index,
  onView,
  onClose,
}: {
  slides: Slide[];
  index: number;
  onView: (index: number) => void;
  onClose: () => void;
}) {
  const viewport = useSyncExternalStore(subscribeResize, viewportSize);
  useEffect(ignoreClickAfterVideoDrag, []);
  const slide = slides[Math.max(0, index)];
  return (
    <Lightbox
      open={index >= 0}
      index={Math.max(0, index)}
      slides={slides}
      close={onClose}
      on={{ view: ({ index: i }) => i !== index && onView(i) }}
      plugins={[Captions, Video, Zoom]}
      carousel={{ finite: true, preload: 1 }}
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
      captions={{ showToggle: false, descriptionTextAlign: "start", descriptionMaxLines: 4 }}
      zoom={{
        scrollToZoom: true,
        maxZoom: MAX_ZOOM,
        maxZoomPixelRatio: slide ? pixelRatioForMaxZoom(slide, viewport) : 1,
        supports: ["video"],
      }}
      video={{ controls: true, playsInline: true, preload: "metadata" }}
      labels={{ "Zoom in": strings.zoomIn, "Zoom out": strings.zoomOut }}
      styles={{ container: { backgroundColor: "rgba(0, 0, 0, 0.94)" } }}
    />
  );
}

/**
 * For images the zoom plugin ignores `maxZoom` and allows zooming up to `maxZoomPixelRatio` times
 * the image's pixel size. Pick the ratio that makes the limit `MAX_ZOOM` times the size the image
 * is shown at, mirroring how the lightbox fits it into the slide area (never upscaled).
 */
function pixelRatioForMaxZoom(slide: Slide, viewport: string): number {
  const { width, height } = slide;
  if (!width || !height) return 1;
  const [viewportWidth, viewportHeight] = viewport.split("x").map(Number) as [number, number];
  const shown = Math.min(
    viewportWidth - 2 * SLIDE_PADDING,
    ((viewportHeight - 2 * SLIDE_PADDING) / height) * width,
    width,
  );
  return shown > 0 ? (MAX_ZOOM * shown) / width : 1;
}

function subscribeResize(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/** A string, so that useSyncExternalStore sees an unchanged snapshot as equal. */
function viewportSize(): string {
  return `${window.innerWidth}x${window.innerHeight}`;
}

/**
 * Clicking a video with native controls toggles playback, and the browser also fires a click when
 * the button is released after panning a zoomed video or swiping. Cancel those clicks.
 */
function ignoreClickAfterVideoDrag(): () => void {
  let start: { x: number; y: number } | undefined;
  const onPointerDown = (event: PointerEvent) => {
    start = { x: event.clientX, y: event.clientY };
  };
  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLVideoElement) || !start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_THRESHOLD) {
      event.preventDefault();
    }
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("click", onClick, true);
  return () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("click", onClick, true);
  };
}
