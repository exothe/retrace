import Lightbox from "yet-another-react-lightbox";
import type { Slide } from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Video from "yet-another-react-lightbox/plugins/video";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";

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
  return (
    <Lightbox
      open={index >= 0}
      index={Math.max(0, index)}
      slides={slides}
      close={onClose}
      on={{ view: ({ index: i }) => i !== index && onView(i) }}
      plugins={[Captions, Video]}
      carousel={{ finite: true, preload: 1 }}
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
      captions={{ showToggle: false, descriptionTextAlign: "start", descriptionMaxLines: 4 }}
      video={{ controls: true, playsInline: true, preload: "metadata" }}
      styles={{ container: { backgroundColor: "rgba(0, 0, 0, 0.94)" } }}
    />
  );
}
