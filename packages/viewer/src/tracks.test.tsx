import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "./App.tsx";
import { clearDataCache } from "./data.ts";
import { formatHours, formatKilometers, formatMeters } from "./format.ts";
import { INDEX, TRIP } from "./test/fixtures.ts";
import { intersectAll } from "./test/setup.ts";
import { pinsFor, positionAtFraction, sportLabel } from "./tracks.ts";

// Leaflet can't render in jsdom; a stand-in shows routes and pins as plain elements.
vi.mock("./components/RouteMap.tsx", () => ({
  default: ({
    routes,
    pins,
    highlight,
    onPinClick,
  }: {
    routes: unknown[][];
    pins: { id: string; label: string }[];
    highlight?: [number, number];
    onPinClick: (id: string) => void;
  }) => (
    <div data-testid="map">
      <span>{`routes:${routes.map((r) => r.length).join(",")}`}</span>
      {highlight && (
        <span data-testid="highlight">{highlight.map((v) => v.toFixed(4)).join(",")}</span>
      )}
      {pins.map((pin) => (
        <button key={pin.id} type="button" onClick={() => onPinClick(pin.id)}>
          {`pin ${pin.label}`}
        </button>
      ))}
    </div>
  ),
}));

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <Location />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  clearDataCache();
  const responses: Record<string, unknown> = {
    "./trips/index.json": INDEX,
    "./trips/lissabon-2026/trip.json": TRIP,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => new Response(JSON.stringify(responses[url]))),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("formatting", () => {
  it("formats distances, heights and durations in German", () => {
    expect(formatKilometers(3039)).toBe("3,0 km");
    expect(formatKilometers(12345)).toBe("12,3 km");
    expect(formatKilometers(123456)).toBe("123 km");
    expect(formatMeters(1234)).toBe("1.234 m");
    expect(formatHours(12600)).toBe("3:30 h");
    expect(formatHours(2700)).toBe("45 min");
  });

  it("translates sports, falling back to Strecke", () => {
    expect(sportLabel("hiking")).toBe("Wandern");
    expect(sportLabel("cycling")).toBe("Radfahren");
    expect(sportLabel("somethingNew")).toBe("Strecke");
    expect(sportLabel(undefined)).toBe("Strecke");
  });
});

describe("pinsFor", () => {
  it("shows the thumbnail of each positioned photo or video, skipping media without GPS", () => {
    const media = {
      ...TRIP.media,
      v1: { ...TRIP.media.v1!, gps: { lat: 38.7, lon: -9.1, source: "track" as const } },
    };
    expect(pinsFor("lissabon-2026", ["p2", "p3", "v1"], media)).toEqual([
      {
        id: "p2",
        lat: 38.7114,
        lon: -9.1305,
        label: "Foto um 09:15 Uhr",
        thumb: "./trips/lissabon-2026/media/p2-thumb.webp",
        isVideo: false,
        color: "#336699",
      },
      {
        id: "v1",
        lat: 38.7,
        lon: -9.1,
        label: "Video um 10:00 Uhr, 1:15",
        thumb: "./trips/lissabon-2026/media/v1-poster-thumb.webp",
        isVideo: true,
      },
    ]);
  });
});

describe("positionAtFraction", () => {
  const points = TRIP.tracks.t1!.points;
  it("walks along the route by length", () => {
    expect(positionAtFraction(points, 0)).toEqual([38.7979, -9.3881]);
    expect(positionAtFraction(points, 0.5)).toEqual([38.7876, -9.3906]);
    expect(positionAtFraction(points, 1)).toEqual([38.7979, -9.3881]);
    expect(positionAtFraction(points, 0.25)![0]).toBeCloseTo((38.7979 + 38.7876) / 2, 6);
    expect(positionAtFraction([], 0.5)).toBeUndefined();
  });
});

describe("track card", () => {
  it("shows sport, times and stats, and the map only once scrolled into view", async () => {
    renderAt("/lissabon-2026/2026-10-24");
    const card = await screen.findByRole("region", { name: "Wandern" });
    expect(within(card).getByText("09:00–12:30 Uhr")).toBeTruthy();
    expect(within(card).getByText("3,0 km", { selector: "dd" })).toBeTruthy();
    expect(within(card).getByText("3:30 h (3:10 h in Bewegung)")).toBeTruthy();
    expect(within(card).getByText("↑ 178 m")).toBeTruthy();
    expect(within(card).getByText("↓ 177 m")).toBeTruthy();
    expect(within(card).getByRole("img", { name: /Höhenprofil/ })).toBeTruthy();

    expect(within(card).queryByTestId("map")).toBeNull();
    expect(within(card).getByText("Karte wird geladen …")).toBeTruthy();
    act(() => intersectAll());
    const map = await within(card).findByTestId("map");
    expect(within(map).getByText("routes:3")).toBeTruthy();
  });

  it("opens a pinned photo of another day in that day's lightbox", async () => {
    const user = userEvent.setup();
    renderAt("/lissabon-2026/2026-10-24");
    await screen.findByRole("region", { name: "Wandern" });
    act(() => intersectAll());
    await user.click(await screen.findByRole("button", { name: "pin Foto um 09:15 Uhr" }));
    expect(screen.getByTestId("location").textContent).toBe("/lissabon-2026/2026-10-23/p2");
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("shows the hovered profile position on the map", async () => {
    renderAt("/lissabon-2026/2026-10-24");
    const card = await screen.findByRole("region", { name: "Wandern" });
    act(() => intersectAll());
    await within(card).findByTestId("map");
    const svg = within(card).getByRole("img", { name: /Höhenprofil/ });
    svg.getBoundingClientRect = () => ({ left: 0, width: 600, top: 0, height: 120 }) as DOMRect;
    fireEvent.pointerMove(svg, { clientX: 300 });
    expect(within(card).getByTestId("highlight").textContent).toBe("38.7876,-9.3906");
    fireEvent.pointerLeave(svg);
    expect(within(card).queryByTestId("highlight")).toBeNull();
  });
});

describe("day map", () => {
  it("is collapsed by default and shows the day's pins when opened", async () => {
    const user = userEvent.setup();
    renderAt("/lissabon-2026/2026-10-23");
    const toggle = await screen.findByRole("button", { name: "Karte anzeigen" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "Karte des Tages" })).toBeNull();

    await user.click(toggle);
    act(() => intersectAll());
    const region = screen.getByRole("region", { name: "Karte des Tages" });
    await user.click(await within(region).findByRole("button", { name: "pin Foto um 09:15 Uhr" }));
    expect(screen.getByTestId("location").textContent).toBe("/lissabon-2026/2026-10-23/p2");
  });

  it("isn't shown for days without positioned media", async () => {
    renderAt("/lissabon-2026/2026-10-22");
    await screen.findByText("Für diesen Tag gibt es keine Notizen.");
    expect(screen.queryByRole("button", { name: "Karte anzeigen" })).toBeNull();
  });
});

describe("day list", () => {
  it("marks days with a track", async () => {
    renderAt("/lissabon-2026");
    await screen.findByRole("heading", { level: 1, name: "Lissabon 2026" });
    const link = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "/lissabon-2026/2026-10-24")!;
    expect(within(link).getByLabelText("Mit GPS-Strecke")).toBeTruthy();
  });
});
