import { Suspense, lazy } from "react";
import type { LatLngTuple } from "leaflet";
import { strings } from "../strings.ts";
import { LazyMount } from "./LazyMount.tsx";
import type { MapPin } from "./RouteMap.tsx";

const RouteMap = lazy(() => import("./RouteMap.tsx"));

/** A map that loads Leaflet and initializes only when scrolled into view. */
export function MapView(props: {
  routes: LatLngTuple[][];
  pins: MapPin[];
  highlight?: LatLngTuple | undefined;
  onPinClick: (id: string) => void;
  className?: string;
}) {
  const { className = "h-64", ...mapProps } = props;
  const placeholder = (
    <div className="flex size-full items-center justify-center text-sm text-zinc-500">
      {strings.mapLoading}
    </div>
  );
  return (
    <LazyMount
      className={`overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900 ${className}`}
      placeholder={placeholder}
    >
      <Suspense fallback={placeholder}>
        <RouteMap {...mapProps} />
      </Suspense>
    </LazyMount>
  );
}
