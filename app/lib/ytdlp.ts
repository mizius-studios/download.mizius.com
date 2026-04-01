import { YtDlp, helpers } from "ytdlp-nodejs";

let ytdlpInitPromise: Promise<YtDlp> | null = null;

export async function getYtDlp(): Promise<YtDlp> {
  if (ytdlpInitPromise) {
    return ytdlpInitPromise;
  }

  ytdlpInitPromise = (async () => {
    const initialFfmpegPath = process.env.FFMPEG_PATH || helpers.findFFmpegBinary();
    let ytdlp = new YtDlp({
      ffmpegPath: initialFfmpegPath,
    });

    const installed = await ytdlp.checkInstallationAsync({ ffmpeg: false });
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

    let ffmpegPath: string | undefined = initialFfmpegPath;
    if (!ffmpegPath) {
      try {
        ffmpegPath = await ytdlp.downloadFFmpeg();
      } catch {
        // Some production targets can't download binaries at runtime.
        ffmpegPath = undefined;
      }
    }

    if (ffmpegPath) {
      ytdlp = new YtDlp({
        binaryPath: updated.binaryPath,
        ffmpegPath,
      });
    }

    const installedAfterUpdate = await ytdlp.checkInstallationAsync({
      ffmpeg: false,
    });

    if (!installedAfterUpdate) {
      throw new Error(
        "yt-dlp is not executable in this runtime. Ensure binaries can run in production."
      );
    }

    return ytdlp;
  })().catch((error) => {
    ytdlpInitPromise = null;
    throw error;
  });

  return ytdlpInitPromise;
}
