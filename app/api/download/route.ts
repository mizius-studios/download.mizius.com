import { PassThrough } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { getYtDlp } from "@/app/lib/ytdlp";
import { createCookiesTempFile } from "@/app/lib/cookies";

const YOUTUBE_URL_RE =
  /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/;

async function handleDownload(
  url: string | null,
  type: string,
  cookies: string | null
) {
  let cookieFile: Awaited<ReturnType<typeof createCookiesTempFile>> = null;

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

    // Create a PassThrough stream to pipe yt-dlp output into
    const passThrough = new PassThrough();

    // Build the stream with appropriate format selection
    const streamBuilder = ytdlp.stream(url);
    if (cookieFile) {
      streamBuilder.cookies(cookieFile.path);
    }

    if (type === "audio") {
      streamBuilder.filter("audioonly").type("mp3");
    } else if (type === "video-only") {
      streamBuilder.filter("mergevideo").quality("highest").type("mp4");
    } else {
      streamBuilder.filter("audioandvideo").quality("highest").type("mp4");
    }

    // Pipe yt-dlp stream into our PassThrough and clean up the temp cookie file
    const downloadPromise = streamBuilder.pipe(passThrough);
    void downloadPromise.finally(() => {
      if (cookieFile) {
        void cookieFile.cleanup();
      }
    }).catch(() => {});

    // Convert Node.js stream to Web ReadableStream
    const readableStream = new ReadableStream({
      start(controller) {
        passThrough.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        passThrough.on("end", () => {
          controller.close();
        });
        passThrough.on("error", (err: Error) => {
          console.error("Stream error:", err);
          controller.error(err);
        });
      },
      cancel() {
        passThrough.destroy();
      },
    });

    const ext = type === "audio" ? "mp3" : "mp4";

    return new Response(readableStream, {
      headers: {
        "Content-Type": type === "audio" ? "audio/mpeg" : "video/mp4",
        "Content-Disposition": `attachment; filename="${title}.${ext}"`,
      },
    });
  } catch (error) {
    if (cookieFile) {
      await cookieFile.cleanup();
    }
    console.error("Download error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to download video.";
    const status = message.includes("Cookies must") ? 400 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  return handleDownload(
    searchParams.get("url"),
    searchParams.get("type") || "video",
    null
  );
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const url = formData.get("url");
  const type = (formData.get("type") as string | null) || "video";
  const cookies = formData.get("cookies");

  return handleDownload(
    typeof url === "string" ? url : null,
    type,
    typeof cookies === "string" ? cookies : null
  );
}
