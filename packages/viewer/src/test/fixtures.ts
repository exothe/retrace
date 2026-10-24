import type { Media, Trip, TripIndex } from "@retrace/shared";

const photo = (id: string, takenAt: string, localTime: string): Media => ({
  id,
  type: "photo",
  takenAt,
  localTime,
  width: 400,
  height: 300,
  color: "#336699",
  thumb: `media/${id}-thumb.webp`,
  display: `media/${id}-display.webp`,
});

export const TRIP: Trip = {
  schemaVersion: 1,
  generatedAt: "2026-11-01T00:00:00Z",
  slug: "lissabon-2026",
  title: "Lissabon 2026",
  timezone: "Europe/Lisbon",
  startDate: "2026-10-22",
  endDate: "2026-10-24",
  cover: "p2",
  days: [
    {
      date: "2026-10-22",
      hasNotes: false,
      before: [{ kind: "media", id: "p1" }],
      entries: [],
      mapMediaIds: [],
    },
    {
      date: "2026-10-23",
      hasNotes: true,
      before: [],
      entries: [
        {
          id: "2026-10-23-1",
          time: "09:10",
          timestamp: "2026-10-23T08:10:00Z",
          text: "Raus in die <b>Stadt</b>",
          items: [
            { kind: "media", id: "p2" },
            { kind: "media", id: "v1" },
          ],
        },
        {
          id: "2026-10-23-2",
          time: "13:30",
          timestamp: "2026-10-23T12:30:00Z",
          text: "Mittagessen",
          items: [{ kind: "media", id: "p3" }],
        },
        {
          id: "2026-10-23-3",
          time: "20:00",
          timestamp: "2026-10-23T19:00:00Z",
          text: "Abends",
          items: [],
        },
      ],
      mapMediaIds: ["p2"],
    },
    {
      date: "2026-10-24",
      hasNotes: true,
      before: [],
      entries: [
        {
          id: "2026-10-24-1",
          time: "08:00",
          timestamp: "2026-10-24T07:00:00Z",
          text: "Wandern",
          items: [],
        },
      ],
      mapMediaIds: [],
    },
  ],
  media: {
    p1: photo("p1", "2026-10-22T17:30:00Z", "18:30"),
    p2: photo("p2", "2026-10-23T08:15:12Z", "09:15"),
    p3: photo("p3", "2026-10-23T12:45:00Z", "13:45"),
    v1: {
      id: "v1",
      type: "video",
      takenAt: "2026-10-23T09:00:00Z",
      localTime: "10:00",
      width: 640,
      height: 360,
      src: "media/v1.mp4",
      poster: "media/v1-poster.webp",
      posterThumb: "media/v1-poster-thumb.webp",
      durationSeconds: 75,
    },
  },
  tracks: {},
};

export const INDEX: TripIndex = {
  schemaVersion: 1,
  generatedAt: "2026-11-01T00:00:00Z",
  trips: [
    {
      slug: "lissabon-2026",
      title: "Lissabon 2026",
      startDate: "2026-10-22",
      endDate: "2026-10-24",
      dayCount: 3,
      photoCount: 3,
      videoCount: 1,
      cover: {
        thumb: "trips/lissabon-2026/media/p2-thumb.webp",
        display: "trips/lissabon-2026/media/p2-display.webp",
        color: "#336699",
      },
    },
  ],
};
