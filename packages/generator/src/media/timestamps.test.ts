import { describe, expect, it } from "vitest";
import type { RawMetadata } from "./metadata.ts";
import { findCameraOffset, parseExifDate, parseFileName, resolveTimestamp } from "./timestamps.ts";
import type { TimestampInput, TimestampOptions } from "./timestamps.ts";

const LISBON = "Europe/Lisbon";
const OPTIONS: TimestampOptions = { timezone: LISBON, videoTimesAreUtc: true, cameraOffsets: {} };
const MTIME = new Date("2026-11-01T12:00:00Z");

const resolve = (
  input: Partial<TimestampInput> & { metadata?: RawMetadata },
  options: Partial<TimestampOptions> = {},
) => {
  const result = resolveTimestamp(
    { kind: "photo", file: "photo.jpg", mtime: MTIME, metadata: {}, ...input },
    { ...OPTIONS, ...options },
  );
  return {
    iso: result.instant.toISO(),
    source: result.source,
    camera: result.camera,
    key: result.cameraOffsetKey,
  };
};

describe("resolveTimestamp for photos", () => {
  it("uses DateTimeOriginal with OffsetTimeOriginal and subseconds as an exact instant", () => {
    expect(
      resolve({
        metadata: {
          dateTimeOriginal: "2026:10:23 09:15:12",
          offsetTimeOriginal: "+01:00",
          subSecTimeOriginal: "250",
          createDate: "2020:01:01 00:00:00",
        },
      }),
    ).toMatchObject({ iso: "2026-10-23T08:15:12.250Z", source: "exif-offset" });
  });

  it("keeps the offset even if it differs from the trip timezone", () => {
    expect(
      resolve({
        metadata: { dateTimeOriginal: "2026:10:23 09:15:12", offsetTimeOriginal: "-05:00" },
      }).iso,
    ).toBe("2026-10-23T14:15:12.000Z");
  });

  it("interprets DateTimeOriginal without an offset in the trip timezone", () => {
    expect(resolve({ metadata: { dateTimeOriginal: "2026:10:23 09:15:12" } })).toMatchObject({
      iso: "2026-10-23T08:15:12.000Z", // WEST, UTC+1
      source: "exif-local",
    });
  });

  it("uses the trip timezone's offset on that date, across the DST switch", () => {
    // Lisbon switches from UTC+1 to UTC+0 on 25.10.2026 at 02:00 local.
    expect(resolve({ metadata: { dateTimeOriginal: "2026:10:25 01:30:00" } }).iso).toBe(
      "2026-10-25T00:30:00.000Z",
    );
    expect(resolve({ metadata: { dateTimeOriginal: "2026:10:25 11:00:00" } }).iso).toBe(
      "2026-10-25T11:00:00.000Z",
    );
  });

  it("accepts subseconds with leading zeros and inline offsets and fractions", () => {
    expect(
      resolve({ metadata: { dateTimeOriginal: "2026:10:23 09:15:12", subSecTimeOriginal: "025" } })
        .iso,
    ).toBe("2026-10-23T08:15:12.025Z");
    expect(
      resolve({ metadata: { dateTimeOriginal: "2026:10:23 09:15:12.5+02:00" } }),
    ).toMatchObject({
      iso: "2026-10-23T07:15:12.500Z",
      source: "exif-offset",
    });
    expect(resolve({ metadata: { dateTimeOriginal: "2026-10-23T09:15:12Z" } }).iso).toBe(
      "2026-10-23T09:15:12.000Z",
    );
  });

  it("falls back to CreateDate, with its own offset tag", () => {
    expect(resolve({ metadata: { createDate: "2026:10:24 16:20:00" } })).toMatchObject({
      iso: "2026-10-24T15:20:00.000Z",
      source: "create-date",
    });
    expect(
      resolve({ metadata: { createDate: "2026:10:24 16:20:00", offsetTimeDigitized: "+00:00" } })
        .iso,
    ).toBe("2026-10-24T16:20:00.000Z");
  });

  it("ignores placeholder and malformed dates", () => {
    expect(
      resolve({
        file: "IMG_20261024_120000.jpg",
        metadata: { dateTimeOriginal: "0000:00:00 00:00:00", createDate: "    :  :     :  :  " },
      }).source,
    ).toBe("filename");
    expect(resolve({ metadata: { dateTimeOriginal: "2026:02:31 10:00:00" } }).source).toBe("mtime");
  });

  it("ignores an invalid offset tag and uses the trip timezone", () => {
    expect(
      resolve({
        metadata: { dateTimeOriginal: "2026:10:23 09:15:12", offsetTimeOriginal: "   :  " },
      }),
    ).toMatchObject({ iso: "2026-10-23T08:15:12.000Z", source: "exif-local" });
  });

  it("falls back to the file name, then to the modification time", () => {
    expect(resolve({ file: "/a/IMG_20261024_120000.jpg" })).toMatchObject({
      iso: "2026-10-24T11:00:00.000Z",
      source: "filename",
    });
    expect(resolve({ file: "/a/urlaub.jpg" })).toMatchObject({
      iso: "2026-11-01T12:00:00.000Z",
      source: "mtime",
    });
  });

  it("does not use video tags for photos", () => {
    expect(resolve({ metadata: { quickTimeCreateDate: "2026:10:23 09:00:00" } }).source).toBe(
      "mtime",
    );
  });
});

describe("resolveTimestamp for videos", () => {
  const video = (
    metadata: RawMetadata,
    options: Partial<TimestampOptions> = {},
    file = "clip.mp4",
  ) => resolve({ kind: "video", file, metadata }, options);

  it("treats QuickTime CreateDate as UTC by default", () => {
    expect(video({ quickTimeCreateDate: "2026:10:23 09:00:00" })).toMatchObject({
      iso: "2026-10-23T09:00:00.000Z",
      source: "quicktime",
    });
  });

  it("falls back to MediaCreateDate", () => {
    expect(
      video({
        quickTimeCreateDate: "0000:00:00 00:00:00",
        quickTimeMediaCreateDate: "2026:10:23 09:00:00",
      }).iso,
    ).toBe("2026-10-23T09:00:00.000Z");
  });

  it("interprets QuickTime dates in the trip timezone if videoTimesAreUtc is false", () => {
    expect(
      video({ quickTimeCreateDate: "2026:10:23 10:00:00" }, { videoTimesAreUtc: false }).iso,
    ).toBe("2026-10-23T09:00:00.000Z");
  });

  it("prefers a timezone-aware CreationDate", () => {
    expect(
      video({
        quickTimeCreateDate: "2026:10:25 12:20:00",
        quickTimeCreationDate: "2026:10:25 13:21:00+01:00",
      }),
    ).toMatchObject({ iso: "2026-10-25T12:21:00.000Z", source: "quicktime-tz" });
  });

  it("ignores a CreationDate without an offset", () => {
    expect(
      video({
        quickTimeCreateDate: "2026:10:25 12:20:00",
        quickTimeCreationDate: "2026:10:25 13:21:00",
      }).source,
    ).toBe("quicktime");
  });

  it("falls back to VID_ file names (local) and then the modification time", () => {
    expect(video({}, {}, "VID_20261023_100000.mp4")).toMatchObject({
      iso: "2026-10-23T09:00:00.000Z",
      source: "filename",
    });
    expect(video({}).source).toBe("mtime");
  });

  it("does not use photo tags for videos", () => {
    expect(video({ dateTimeOriginal: "2026:10:23 09:15:12" }).source).toBe("mtime");
  });
});

describe("camera offsets", () => {
  const metadata = {
    dateTimeOriginal: "2026:10:24 10:32:30",
    offsetTimeOriginal: "+01:00",
    make: "Canon",
    model: "Canon EOS R6",
  };

  it("applies an offset matched by model", () => {
    expect(resolve({ metadata }, { cameraOffsets: { "Canon EOS R6": -150 } })).toMatchObject({
      iso: "2026-10-24T09:30:00.000Z",
      camera: "Canon Canon EOS R6",
      key: "Canon EOS R6",
    });
  });

  it("prefers a match by make and model", () => {
    expect(
      resolve({ metadata }, { cameraOffsets: { "Canon EOS R6": -150, "Canon Canon EOS R6": 60 } }),
    ).toMatchObject({ iso: "2026-10-24T09:33:30.000Z", key: "Canon Canon EOS R6" });
  });

  it("trims make and model", () => {
    expect(findCameraOffset(" Google ", " Pixel 8 ", { "Google Pixel 8": 1 })).toBe(
      "Google Pixel 8",
    );
    expect(findCameraOffset(undefined, "Pixel 8", { "Pixel 8": 1 })).toBe("Pixel 8");
    expect(findCameraOffset("Google", undefined, { Google: 1 })).toBe("Google");
    expect(findCameraOffset("Google", "Pixel 8", { "Pixel 7": 1 })).toBeUndefined();
  });

  it("applies to videos and to file name timestamps too", () => {
    expect(
      resolve(
        {
          kind: "video",
          file: "VID_20261023_100000.mp4",
          metadata: { make: "Apple", model: "iPhone 15" },
        },
        { cameraOffsets: { "iPhone 15": 3600 } },
      ).iso,
    ).toBe("2026-10-23T10:00:00.000Z");
  });
});

describe("parseFileName", () => {
  const iso = (name: string) => parseFileName(name, LISBON)?.instant.toISO();

  it.each([
    ["IMG_20261023_091512.jpg", "2026-10-23T08:15:12.000Z"],
    ["IMG_20261023_091512_HDR.jpg", "2026-10-23T08:15:12.000Z"],
    ["VID_20261023_091512.mp4", "2026-10-23T08:15:12.000Z"],
    ["PANO_20261023_091512.jpg", "2026-10-23T08:15:12.000Z"],
    ["MVIMG_20261023_091512.jpg", "2026-10-23T08:15:12.000Z"],
    ["img_20261023_091512.jpg", "2026-10-23T08:15:12.000Z"],
    ["20261023_091512.jpg", "2026-10-23T08:15:12.000Z"],
    ["20261023_091512(1).jpg", "2026-10-23T08:15:12.000Z"],
  ])("reads %s as local time", (name, expected) => {
    expect(iso(name)).toBe(expected);
  });

  it("reads PXL_ names as UTC, with milliseconds", () => {
    expect(iso("PXL_20261024_224500123.jpg")).toBe("2026-10-24T22:45:00.123Z");
    expect(iso("PXL_20261024_224500123.NIGHT.jpg")).toBe("2026-10-24T22:45:00.123Z");
    expect(iso("PXL_20261024_224500.mp4")).toBe("2026-10-24T22:45:00.000Z");
  });

  it.each([
    "DSC_0042.jpg",
    "IMG_1234.jpg",
    "IMG_20261323_091512.jpg",
    "IMG_20261023_256000.jpg",
    "x20261023_091512.jpg",
  ])("doesn't match %s", (name) => {
    expect(iso(name)).toBeUndefined();
  });
});

describe("parseExifDate", () => {
  it("returns undefined for missing values", () => {
    expect(parseExifDate(undefined, undefined, undefined, LISBON)).toBeUndefined();
    expect(parseExifDate("", undefined, undefined, LISBON)).toBeUndefined();
  });

  it("accepts dates without seconds", () => {
    expect(parseExifDate("2026:10:23 09:15", undefined, undefined, "UTC")?.instant.toISO()).toBe(
      "2026-10-23T09:15:00.000Z",
    );
  });
});
