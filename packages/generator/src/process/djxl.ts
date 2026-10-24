import { ToolMissingError } from "./ffmpeg.ts";
import { runProcess } from "./run.ts";

/** Per-OS install instructions for djxl (SPEC section 4). */
export function djxlInstallHint(platform: NodeJS.Platform = process.platform): string {
  switch (platform) {
    case "darwin":
      return "Install it with Homebrew: brew install jpeg-xl";
    case "win32":
      return (
        "Download jxl-x64-windows-static.zip from https://github.com/libjxl/libjxl/releases " +
        'and set "djxlPath" in the trip config to the djxl.exe in it.'
      );
    default:
      return "Install it with your package manager, e.g. sudo apt install libjxl-tools";
  }
}

/** Checks that djxl can be run. Throws a ToolMissingError with an install hint otherwise. */
export async function checkDjxl(djxlPath: string): Promise<void> {
  try {
    await runProcess(djxlPath, ["--version"]);
  } catch (error) {
    const reason =
      (error as NodeJS.ErrnoException).code === "ENOENT" ? "not found" : (error as Error).message;
    throw new ToolMissingError(
      `djxl (${djxlPath}): ${reason}. It is needed for JPEG XL photos. ${djxlInstallHint()}`,
    );
  }
}

/**
 * Decodes a JPEG XL file to PNG, because sharp's prebuilt libvips can't read JPEG XL. The PNG
 * keeps the ICC profile and is already upright: djxl applies the orientation and writes no
 * Exif, so sharp's auto-rotation leaves it alone. One thread, as images run in parallel.
 */
export async function decodeJxl(djxlPath: string, input: string, output: string): Promise<void> {
  await runProcess(djxlPath, [input, output, "--num_threads=0", "--quiet"]);
}
