import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { useTempDir } from "../test/temp-dir.ts";
import { writePhoto } from "../test/media-files.ts";
import { createMetadataReader, toRawMetadata } from "./metadata.ts";

const tempDir = useTempDir();
const reader = createMetadataReader();
afterAll(() => reader.close());

const hasFfmpeg = await promisify(execFile)("ffmpeg", ["-version"]).then(
  () => true,
  () => false,
);

describe("toRawMetadata", () => {
  it("picks the first present tag per field, keeps strings and numbers apart", () => {
    expect(
      toRawMetadata({
        "EXIF:DateTimeOriginal": "2026:10:23 09:15:12",
        "XMP:DateTimeOriginal": "2000:01:01 00:00:00",
        "EXIF:SubSecTimeOriginal": 250,
        "QuickTime:AndroidModel": "Pixel 8",
        "Composite:GPSLatitude": "38.71",
        "Composite:GPSLongitude": -9.13,
        "EXIF:Make": "",
      }),
    ).toEqual({
      dateTimeOriginal: "2026:10:23 09:15:12",
      subSecTimeOriginal: "250",
      model: "Pixel 8",
      gpsLatitude: 38.71,
      gpsLongitude: -9.13,
    });
  });

  it("keeps exiftool errors", () => {
    expect(toRawMetadata({ "ExifTool:Error": "File format error" })).toEqual({
      error: "File format error",
    });
  });
});

describe("createMetadataReader (real exiftool)", () => {
  it("reads photo dates as raw strings without timezone inference, and signed GPS", async () => {
    const { dir } = await tempDir();
    const file = await writePhoto(path.join(dir, "a.jpg"), {
      Make: "Canon",
      Model: "Canon EOS R6",
      DateTimeOriginal: "2026:10:23 09:15:12",
      SubSecTimeOriginal: "025",
      CreateDate: "2026:10:23 09:15:13",
      GPSLatitude: 38.7114,
      GPSLongitude: -9.1305,
    });
    expect(await reader.read(file, "photo")).toEqual({
      dateTimeOriginal: "2026:10:23 09:15:12",
      subSecTimeOriginal: "025",
      createDate: "2026:10:23 09:15:13",
      make: "Canon",
      model: "Canon EOS R6",
      gpsLatitude: 38.7114,
      gpsLongitude: -9.1305,
    });
  });

  it("reads offsets as written", async () => {
    const { dir } = await tempDir();
    const file = await writePhoto(path.join(dir, "a.png"), {
      DateTimeOriginal: "2026:10:23 09:15:12",
      OffsetTimeOriginal: "+01:00",
    });
    expect(await reader.read(file, "photo")).toMatchObject({
      dateTimeOriginal: "2026:10:23 09:15:12",
      offsetTimeOriginal: "+01:00",
    });
  });

  it("returns an empty result for a photo without metadata", async () => {
    const { dir } = await tempDir();
    expect(await reader.read(await writePhoto(path.join(dir, "a.jpg")), "photo")).toEqual({});
  });

  it("reports unreadable files", async () => {
    const { write } = await tempDir();
    // Plain text would be read fine (as a TXT file); random bytes are a format error.
    const file = await write("broken.jpg", "\u0001\u0002garbage\u00ff".repeat(10));
    expect((await reader.read(file, "photo")).error).toBe("File format error");
  });

  it.runIf(hasFfmpeg)(
    "reads QuickTime dates as stored (UTC) and the video GPS position",
    async () => {
      const { dir } = await tempDir();
      const file = path.join(dir, "v.mov");
      await promisify(execFile)("ffmpeg", [
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=1:size=64x48:rate=5",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-metadata",
        "creation_time=2026-10-23T09:00:00Z",
        "-metadata",
        "location=+38.7114-009.1305/",
        "-metadata",
        "com.apple.quicktime.creationdate=2026-10-23T10:00:05+0100",
        "-movflags",
        "use_metadata_tags",
        file,
      ]);
      expect(await reader.read(file, "video")).toMatchObject({
        quickTimeCreateDate: "2026:10:23 09:00:00",
        quickTimeMediaCreateDate: "2026:10:23 09:00:00",
        quickTimeCreationDate: "2026:10:23 10:00:05+01:00",
        gpsLatitude: expect.closeTo(38.7114, 3) as number,
        gpsLongitude: expect.closeTo(-9.1305, 3) as number,
      });
    },
  );
});
