import { describe, expect, it } from "vitest";
import { ffmpegInstallHint, parseProbe, scaledSize } from "./ffmpeg.ts";

describe("parseProbe", () => {
  it("reads duration, dimensions and audio", () => {
    expect(
      parseProbe({
        streams: [{ codec_type: "video", width: 1920, height: 1080 }, { codec_type: "audio" }],
        format: { duration: "12.345" },
      }),
    ).toEqual({ durationSeconds: 12.345, width: 1920, height: 1080, rotation: 0, hasAudio: true });
  });

  it("swaps dimensions for rotated videos (display matrix or rotate tag)", () => {
    expect(
      parseProbe({
        streams: [
          {
            codec_type: "video",
            width: 1920,
            height: 1080,
            side_data_list: [{}, { rotation: -90 }],
          },
        ],
      }),
    ).toMatchObject({ width: 1080, height: 1920, rotation: -90, hasAudio: false });
    expect(
      parseProbe({
        streams: [{ codec_type: "video", width: 1920, height: 1080, tags: { rotate: "270" } }],
      }),
    ).toMatchObject({
      width: 1080,
      height: 1920,
    });
    expect(
      parseProbe({
        streams: [{ codec_type: "video", width: 1920, height: 1080, tags: { rotate: "180" } }],
      }),
    ).toMatchObject({
      width: 1920,
      height: 1080,
    });
  });

  it("ignores cover art streams and fails without a video stream", () => {
    expect(() =>
      parseProbe({
        streams: [
          { codec_type: "video", width: 300, height: 300, disposition: { attached_pic: 1 } },
        ],
      }),
    ).toThrow("no video stream");
    expect(() => parseProbe({ streams: [{ codec_type: "audio" }] })).toThrow("no video stream");
  });

  it("falls back to the stream duration, else 0", () => {
    expect(
      parseProbe({ streams: [{ codec_type: "video", width: 2, height: 2, duration: "1.5" }] })
        .durationSeconds,
    ).toBe(1.5);
    expect(
      parseProbe({ streams: [{ codec_type: "video", width: 2, height: 2 }] }).durationSeconds,
    ).toBe(0);
  });
});

describe("scaledSize", () => {
  it("limits the shorter side for landscape and portrait", () => {
    expect(scaledSize(1920, 1080, 720)).toEqual({ width: 1280, height: 720 });
    expect(scaledSize(1080, 1920, 720)).toEqual({ width: 720, height: 1280 });
  });

  it("never upscales and keeps dimensions even", () => {
    expect(scaledSize(640, 360, 720)).toEqual({ width: 640, height: 360 });
    expect(scaledSize(641, 361, 720)).toEqual({ width: 640, height: 360 });
    expect(scaledSize(3840, 1634, 720)).toEqual({ width: 1692, height: 720 });
  });
});

describe("ffmpegInstallHint", () => {
  it("has a hint per OS", () => {
    expect(ffmpegInstallHint("darwin")).toContain("brew install ffmpeg");
    expect(ffmpegInstallHint("win32")).toContain("winget install");
    expect(ffmpegInstallHint("linux")).toContain("apt install ffmpeg");
  });
});
