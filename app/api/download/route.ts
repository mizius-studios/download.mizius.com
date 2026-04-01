import { PassThrough } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { getYtDlp } from "@/app/lib/ytdlp";

const YOUTUBE_URL_RE =
  /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const type = searchParams.get("type") || "video";

    if (!url || !YOUTUBE_URL_RE.test(url)) {
      return NextResponse.json(
        { error: "Invalid YouTube URL." },
        { status: 400 }
      );
    }

    const ytdlp = await getYtDlp();

    // Get the title for the filename
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = (await ytdlp.getInfoAsync(url)) as any;
    const title = (info.title ?? "video").replace(/[^\w\s-]/g, "").trim();

    // Create a PassThrough stream to pipe yt-dlp output into
    const passThrough = new PassThrough();

    // Build the stream with appropriate format selection
    const streamBuilder = ytdlp.stream(url);

    if (type === "audio") {
      streamBuilder.filter("audioonly").type("mp3");
    } else if (type === "video-only") {
      streamBuilder.filter("mergevideo").quality("highest").type("mp4");
    } else {
      streamBuilder.filter("audioandvideo").quality("highest").type("mp4");
    }

    // Pipe yt-dlp stream into our PassThrough
    streamBuilder.pipe(passThrough);

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
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Failed to download video." },
      { status: 500 }
    );
  }
}
