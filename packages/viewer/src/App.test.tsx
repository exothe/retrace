import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "./App.tsx";
import { clearDataCache } from "./data.ts";
import { INDEX, TRIP } from "./test/fixtures.ts";

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <Location />
    </MemoryRouter>,
  );
}

const location = () => screen.getByTestId("location").textContent;
/** Waits for the lightbox's open, slide and close animations; it ignores input meanwhile. */
const animations = () => act(() => new Promise((r) => setTimeout(r, 1000)));

let responses: Record<string, unknown>;
beforeEach(() => {
  clearDataCache();
  responses = { "./trips/index.json": INDEX, "./trips/lissabon-2026/trip.json": TRIP };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = responses[url];
      if (body === undefined) return new Response("", { status: 404, statusText: "Not Found" });
      if (body instanceof Error) throw body;
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("trip list", () => {
  it("shows a card per trip with dates and counts", async () => {
    renderAt("/");
    const link = await screen.findByRole("link", { name: /Lissabon 2026/ });
    expect(link.getAttribute("href")).toBe("/lissabon-2026");
    expect(within(link).getByText("22.–24. Oktober 2026")).toBeTruthy();
    expect(within(link).getByText("3 Tage · 3 Fotos · 1 Video")).toBeTruthy();
    expect(link.querySelector("img")?.getAttribute("src")).toBe(
      "./trips/lissabon-2026/media/p2-thumb.webp",
    );
  });

  it("shows a German error with retry when loading fails", async () => {
    responses["./trips/index.json"] = new Error("offline");
    renderAt("/");
    expect(
      await screen.findByText("Die Liste der Reisen konnte nicht geladen werden."),
    ).toBeTruthy();
    expect(screen.getByText("Keine Verbindung zum Server.")).toBeTruthy();
    responses["./trips/index.json"] = INDEX;
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("link", { name: /Lissabon 2026/ })).toBeTruthy();
  });
});

describe("day list", () => {
  it("lists days with weekday, entry preview, thumbnails and counts, marking media-only days", async () => {
    renderAt("/lissabon-2026");
    expect(await screen.findByRole("heading", { level: 1, name: "Lissabon 2026" })).toBeTruthy();
    const links = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href")?.startsWith("/lissabon-2026/"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/lissabon-2026/2026-10-22",
      "/lissabon-2026/2026-10-23",
      "/lissabon-2026/2026-10-24",
    ]);
    expect(within(links[0]!).getByText("Nur Fotos")).toBeTruthy();
    expect(within(links[1]!).getByText(/Freitag/)).toBeTruthy();
    expect(within(links[1]!).getByText("Raus in die <b>Stadt</b>")).toBeTruthy();
    expect(within(links[1]!).getByText("Mittagessen")).toBeTruthy();
    expect(within(links[1]!).queryByText("Abends")).toBeNull(); // only the first two
    expect(within(links[1]!).getByText("2 Fotos · 1 Video")).toBeTruthy();
    expect(links[1]!.querySelectorAll("img")).toHaveLength(3);
  });

  it("reports an unknown trip", async () => {
    renderAt("/nope");
    expect(await screen.findByText("Diese Reise gibt es nicht.")).toBeTruthy();
  });
});

describe("day timeline", () => {
  it("shows entries in order with their media, rendering text escaped", async () => {
    renderAt("/lissabon-2026/2026-10-23");
    expect(
      await screen.findByRole("heading", { level: 1, name: /Freitag, 23\. Oktober 2026/ }),
    ).toBeTruthy();
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("time")?.textContent)).toEqual([
      "09:10",
      "13:30",
      "20:00",
    ]);
    expect(within(items[0]!).getByText("Raus in die <b>Stadt</b>")).toBeTruthy();
    expect(document.querySelector("b")).toBeNull();
    expect(
      within(items[0]!)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Foto um 09:15 Uhr öffnen", "Video um 10:00 Uhr, 1:15 öffnen"]);
    const img = within(items[0]!).getAllByRole("img")[0]!;
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("width")).toBe("400");
  });

  it("marks media-only days", async () => {
    renderAt("/lissabon-2026/2026-10-22");
    expect(await screen.findByText("Für diesen Tag gibt es keine Notizen.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /öffnen/ })).toHaveLength(1);
  });

  it("navigates between days with buttons and arrow keys", async () => {
    renderAt("/lissabon-2026/2026-10-23");
    await screen.findByRole("heading", { level: 1, name: /23\. Oktober/ });
    expect(screen.getByRole("link", { name: "Vorheriger Tag" }).getAttribute("href")).toBe(
      "/lissabon-2026/2026-10-22",
    );
    await userEvent.keyboard("{ArrowRight}");
    expect(location()).toBe("/lissabon-2026/2026-10-24");
    expect(screen.queryByRole("link", { name: "Nächster Tag" })).toBeNull();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(location()).toBe("/lissabon-2026/2026-10-22");
  });

  it("links back to the day list", async () => {
    renderAt("/lissabon-2026/2026-10-23");
    const back = await screen.findByRole("link", { name: "Alle Tage" });
    expect(back.getAttribute("href")).toBe("/lissabon-2026");
  });

  it("reports an unknown day", async () => {
    renderAt("/lissabon-2026/2026-12-24");
    expect(await screen.findByText("Diesen Tag gibt es in dieser Reise nicht.")).toBeTruthy();
  });
});

describe("lightbox", () => {
  it("opens from a thumbnail, updates the URL while browsing and closes back to the day", async () => {
    const user = userEvent.setup();
    renderAt("/lissabon-2026/2026-10-23");
    await user.click(await screen.findByRole("button", { name: "Foto um 09:15 Uhr öffnen" }));
    expect(location()).toBe("/lissabon-2026/2026-10-23/p2");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("09:15 Uhr")).toBeTruthy();

    // The lightbox reports a new slide (and so changes the URL) after its slide animation.
    await animations();
    await user.keyboard("{ArrowRight}");
    await animations();
    expect(location()).toBe("/lissabon-2026/2026-10-23/v1");
    // Arrow keys move within the lightbox, not to the next day.
    await user.keyboard("{ArrowRight}");
    await animations();
    expect(location()).toBe("/lissabon-2026/2026-10-23/p3");

    await user.keyboard("{Escape}");
    await animations(); // close animation
    expect(location()).toBe("/lissabon-2026/2026-10-23");
  });

  it("opens from a deep link with time and entry text as caption", async () => {
    renderAt("/lissabon-2026/2026-10-23/v1");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("10:00 Uhr")).toBeTruthy();
    expect(within(dialog).getAllByText("Raus in die <b>Stadt</b>").length).toBeGreaterThan(0);
    expect(dialog.querySelector("video")?.getAttribute("poster")).toBe(
      "./trips/lissabon-2026/media/v1-poster.webp",
    );
  });

  it("ignores the click that ends a drag on a video, so it doesn't toggle playback", async () => {
    renderAt("/lissabon-2026/2026-10-23/v1");
    const video = (await screen.findByRole("dialog")).querySelector("video")!;
    fireEvent.pointerDown(video, { clientX: 100, clientY: 100 });
    expect(fireEvent.click(video, { clientX: 160, clientY: 120 })).toBe(false);
    fireEvent.pointerDown(video, { clientX: 100, clientY: 100 });
    expect(fireEvent.click(video, { clientX: 101, clientY: 100 })).toBe(true);
  });

  it("closes a deep-linked lightbox to the day route", async () => {
    const user = userEvent.setup();
    renderAt("/lissabon-2026/2026-10-23/p3");
    await screen.findByRole("dialog");
    await animations();
    await user.keyboard("{Escape}");
    await animations();
    expect(location()).toBe("/lissabon-2026/2026-10-23");
  });
});
