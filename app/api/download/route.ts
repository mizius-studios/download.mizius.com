import { createReadStream } from "fs";
import { mkdtemp, rm, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { NextRequest, NextResponse } from "next/server";
import { getYtDlp } from "@/app/lib/ytdlp";
import { createCookiesTempFile } from "@/app/lib/cookies";

const YOUTUBE_URL_RE =
  /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/;

export const runtime = "nodejs";

function mimeForExt(ext: string, fallbackType: string): string {
  const normalized = ext.toLowerCase();
  if (normalized === "mp4") return "video/mp4";
  if (normalized === "webm") return fallbackType === "audio" ? "audio/webm" : "video/webm";
  if (normalized === "m4a") return "audio/mp4";
  if (normalized === "mp3") return "audio/mpeg";
  if (normalized === "ogg") return "audio/ogg";
  return fallbackType === "audio" ? "audio/mpeg" : "video/mp4";
}

async function handleDownload(
  url: string | null,
  type: string,
  formatId: string | null,
  ext: string | null,
  cookies: string | null
) {
  let cookieFile: Awaited<ReturnType<typeof createCookiesTempFile>> = null;
  let tempDir: string | null = null;

  try {
    if (!url || !YOUTUBE_URL_RE.test(url)) {
      return NextResponse.json(
        { error: "Invalid YouTube URL." },
        { status: 400 }
      );
    }

    const ytdlp = await getYtDlp();
    cookieFile = cookies ? await createCookiesTempFile(cookies) : null;

    const cookieOptions = cookieFile ? { cookies: cookieFile.path } : undefined;

    // Get the title for the filename
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = (await ytdlp.getInfoAsync(url, cookieOptions)) as any;
    const title = (info.title ?? "video").replace(/[^\w\s-]/g, "").trim();

    tempDir = await mkdtemp(join(tmpdir(), "mizius-download-"));
    const downloadBuilder = ytdlp
      .download(url)
      .setOutputTemplate(join(tempDir, "%(title).140B.%(ext)s"))
      .addOption("noPlaylist", true);

    if (cookieFile) {
      downloadBuilder.cookies(cookieFile.path);
    }

    if (formatId) {
      if (type === "video-only") {
        downloadBuilder
          .format(`${formatId}+bestaudio[ext=m4a]/bestaudio`)
          .addArgs("--merge-output-format", "mp4");
      } else {
        downloadBuilder.format(formatId);
      }
    } else if (type === "audio") {
      downloadBuilder.filter("audioonly").type("mp3");
    } else if (type === "video-only") {
      downloadBuilder.filter("mergevideo").quality("highest").type("mp4");
    } else {
      downloadBuilder.filter("audioandvideo").quality("highest").type("mp4");
    }

    const result = await downloadBuilder.run();
    const downloadedPath = result.filePaths?.[0];
    if (!downloadedPath) {
      throw new Error("yt-dlp finished without producing an output file.");
    }

    const fileStats = await stat(downloadedPath);
    const outputExt = downloadedPath.split(".").pop()?.toLowerCase() || ext || "mp4";
    const fileExt = outputExt.toLowerCase();
    const fileStream = createReadStream(downloadedPath);

    const cleanup = async () => {
      if (tempDir) {
        const dir = tempDir;
        tempDir = null;
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    };

    const readableStream = new ReadableStream<Uint8Array>({
      start(controller) {
        fileStream.on("data", (chunk) => {
          const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          controller.enqueue(new Uint8Array(bytes));
        });
        fileStream.on("end", () => {
          controller.close();
          void cleanup();
        });
        fileStream.on("error", (err: Error) => {
          console.error("Stream error:", err);
          controller.error(err);
          void cleanup();
        });
      },
      cancel() {
        fileStream.destroy();
        void cleanup();
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": mimeForExt(fileExt, type),
        "Content-Length": String(fileStats.size),
        "Content-Disposition": `attachment; filename="${title}.${fileExt}"`,
      },
    });
  } catch (error) {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
    console.error("Download error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to download video.";
    const status = message.includes("Cookies must") ? 400 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  } finally {
    if (cookieFile) {
      await cookieFile.cleanup();
    }
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  return handleDownload(
    searchParams.get("url"),
    searchParams.get("type") || "video",
    searchParams.get("formatId"),
    searchParams.get("ext"),
    null
  );
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const url = formData.get("url");
  const type = (formData.get("type") as string | null) || "video";
  const formatId = formData.get("formatId");
  const ext = formData.get("ext");
  const cookies = formData.get("cookies");

  return handleDownload(
    typeof url === "string" ? url : null,
    type,
    typeof formatId === "string" ? formatId : null,
    typeof ext === "string" ? ext : null,
    typeof cookies === "string" ? cookies : null
  );
}
