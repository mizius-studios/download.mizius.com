import { YtDlp } from "ytdlp-nodejs";

let ytdlpInitPromise: Promise<YtDlp> | null = null;

export async function getYtDlp(): Promise<YtDlp> {
  if (ytdlpInitPromise) {
    return ytdlpInitPromise;
  }

  ytdlpInitPromise = (async () => {
    let ytdlp = new YtDlp();

    const installed = await ytdlp.checkInstallationAsync({ ffmpeg: true });
    if (installed) {
      return ytdlp;
    }

    const updated = await ytdlp.updateYtDlpAsync({
      preferBuiltIn: false,
      verifyChecksum: true,
    });

    ytdlp = new YtDlp({
      binaryPath: updated.binaryPath,
    });

    const ffmpegPath = await ytdlp.downloadFFmpeg();
    if (ffmpegPath) {
      ytdlp = new YtDlp({
        binaryPath: updated.binaryPath,
        ffmpegPath,
      });
    }

    const installedAfterUpdate = await ytdlp.checkInstallationAsync({
      ffmpeg: true,
    });

    if (!installedAfterUpdate) {
      throw new Error(
        "yt-dlp/ffmpeg is not executable in this runtime. Ensure binaries can run in production."
      );
    }

    return ytdlp;
  })().catch((error) => {
    ytdlpInitPromise = null;
    throw error;
  });

  return ytdlpInitPromise;
}
