import { YtDlp } from "ytdlp-nodejs";

let ytdlpInitPromise: Promise<YtDlp> | null = null;

export async function getYtDlp(): Promise<YtDlp> {
  if (ytdlpInitPromise) {
    return ytdlpInitPromise;
  }

  ytdlpInitPromise = (async () => {
    const ytdlp = new YtDlp();

    const installed = await ytdlp.checkInstallationAsync({ ffmpeg: false });
    if (installed) {
      return ytdlp;
    }

    const updated = await ytdlp.updateYtDlpAsync({
      preferBuiltIn: false,
      verifyChecksum: true,
    });

    const ytdlpWithUpdatedBinary = new YtDlp({
      binaryPath: updated.binaryPath,
    });

    const installedAfterUpdate = await ytdlpWithUpdatedBinary.checkInstallationAsync({
      ffmpeg: false,
    });

    if (!installedAfterUpdate) {
      throw new Error(
        "yt-dlp is not executable in this runtime. Ensure python3 is installed in production."
      );
    }

    return ytdlpWithUpdatedBinary;
  })().catch((error) => {
    ytdlpInitPromise = null;
    throw error;
  });

  return ytdlpInitPromise;
}
