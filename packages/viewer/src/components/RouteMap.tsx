import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import { divIcon } from "leaflet";
import type { DivIcon, LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapPin {
  id: string;
  lat: number;
  lon: number;
  label: string;
  /** Thumbnail URL */
  thumb: string;
  /** Placeholder background while the thumbnail loads */
  color?: string;
  isVideo: boolean;
}

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
// Tailwind sky-600 / amber-500; Leaflet paths take plain colors.
const ROUTE_COLOR = "#0284c7";
const HIGHLIGHT_COLOR = "#f59e0b";
/** Thumbnail pin size in px; the pointer below it adds PIN_POINTER px. */
const PIN_SIZE = 44;
const PIN_POINTER = 7;

/**
 * A Leaflet map with OSM tiles (the only external requests, SPEC section 3), route lines and
 * media pins that show each photo's or video's thumbnail where it was taken. Pins are divIcons
 * (default marker images break with bundlers). Fits all content. Loaded lazily, so Leaflet is
 * only downloaded when a map is shown.
 */
export default function RouteMap({
  routes,
  pins,
  highlight,
  onPinClick,
}: {
  routes: LatLngTuple[][];
  pins: MapPin[];
  highlight?: LatLngTuple | undefined;
  onPinClick: (id: string) => void;
}) {
  const bounds = [...routes.flat(), ...pins.map((p): LatLngTuple => [p.lat, p.lon])];
  // New icon objects make Leaflet replace the marker elements, so create them once per pin set.
  const icons = useMemo(() => new Map(pins.map((pin) => [pin.id, thumbIcon(pin)])), [pins]);
  return (
    <MapContainer
      className="size-full"
      center={bounds[0] ?? [0, 0]}
      zoom={13}
      scrollWheelZoom
      attributionControl
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} />
      <FitBounds points={bounds} padding={PIN_SIZE + PIN_POINTER} />
      {routes.map((route, i) => (
        <Polyline
          key={i}
          positions={route}
          pathOptions={{ color: ROUTE_COLOR, weight: 4, opacity: 0.85 }}
        />
      ))}
      {highlight && (
        <CircleMarker
          center={highlight}
          radius={6}
          interactive={false}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: HIGHLIGHT_COLOR, fillOpacity: 1 }}
        />
      )}
      {pins.map((pin) => (
        <Marker
          key={pin.id}
          position={[pin.lat, pin.lon]}
          icon={icons.get(pin.id)!}
          title={pin.label}
          alt={pin.label}
          riseOnHover
          eventHandlers={{ click: () => onPinClick(pin.id) }}
        />
      ))}
    </MapContainer>
  );
}

/** A framed thumbnail with a small pointer whose tip marks the position. */
function thumbIcon(pin: MapPin): DivIcon {
  const background = pin.color ? ` style="background-color:${escapeHtml(pin.color)}"` : "";
  const play = pin.isVideo ? '<span class="retrace-pin-play" aria-hidden="true"></span>' : "";
  return divIcon({
    className: "retrace-pin",
    html:
      `<span class="retrace-pin-frame"${background}>` +
      `<img src="${escapeHtml(pin.thumb)}" alt="" loading="lazy" decoding="async" />${play}` +
      `</span>`,
    iconSize: [PIN_SIZE, PIN_SIZE + PIN_POINTER],
    iconAnchor: [PIN_SIZE / 2, PIN_SIZE + PIN_POINTER],
  });
}

/** Leaflet inserts icon HTML as markup, so values from trip.json are escaped. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function FitBounds({ points, padding }: { points: LatLngTuple[]; padding: number }) {
  const map = useMap();
  const key = JSON.stringify([points[0], points.at(-1), points.length]);
  useEffect(() => {
    if (points.length === 1) map.setView(points[0]!, 15);
    else if (points.length > 1) map.fitBounds(points, { padding: [padding, padding], maxZoom: 16 });
    // Refit only when the content changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}
