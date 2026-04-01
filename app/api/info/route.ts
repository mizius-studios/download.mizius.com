import { YtDlp } from "ytdlp-nodejs";
import { NextRequest, NextResponse } from "next/server";

const YOUTUBE_URL_RE =
  /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/;

interface YtFormat {
  format_id: string;
  format_note?: string;
  ext: string;
  vcodec: string;
  acodec: string;
  resolution: string;
  filesize_approx: number | null;
  filesize?: number | null;
  abr: number | null;
  vbr: number | null;
  format: string;
  width?: number;
  height?: number;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || !YOUTUBE_URL_RE.test(url)) {
      return NextResponse.json(
        { error: "Please provide a valid YouTube URL." },
        { status: 400 }
      );
    }

    const ytdlp = new YtDlp();
    const [infoRaw, formatsRaw] = await Promise.all([
      ytdlp.getInfoAsync(url),
      ytdlp.getFormatsAsync(url),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = infoRaw as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allFormats = ((formatsRaw as any).formats ?? formatsRaw) as YtFormat[];

    // Combined video+audio (mp4 only, has both codecs)
    const combined = allFormats
      .filter(
        (f) =>
          f.vcodec !== "none" &&
          f.acodec !== "none" &&
          f.ext === "mp4" &&
          f.height &&
          f.height > 0 &&
          !f.format.includes("storyboard")
      )
      .map((f) => ({
        formatId: f.format_id,
        quality: `${f.height}p`,
        ext: f.ext,
        filesize: f.filesize ?? f.filesize_approx ?? null,
        type: "video" as const,
      }))
      .sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

    // Video-only (mp4 with avc1, for broad compatibility)
    const videoOnly = allFormats
      .filter(
        (f) =>
          f.vcodec !== "none" &&
          f.acodec === "none" &&
          f.ext === "mp4" &&
          f.vcodec.startsWith("avc1") &&
          f.height &&
          f.height > 0
      )
      .map((f) => ({
        formatId: f.format_id,
        quality: `${f.height}p${f.format_note?.includes("60") ? "60" : ""}`,
        ext: f.ext,
        filesize: f.filesize ?? f.filesize_approx ?? null,
        type: "video-only" as const,
      }))
      .sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

    // Audio-only (m4a preferred, then webm)
    const audioOnly = allFormats
      .filter(
        (f) =>
          f.acodec !== "none" &&
          f.vcodec === "none" &&
          (f.ext === "m4a" || f.ext === "webm") &&
          f.abr &&
          f.abr > 0
      )
      .map((f) => ({
        formatId: f.format_id,
        quality: `Audio ${Math.round(f.abr!)}kbps`,
        ext: f.ext,
        filesize: f.filesize ?? f.filesize_approx ?? null,
        type: "audio" as const,
      }))
      .sort(
        (a, b) =>
          parseInt(b.quality.replace(/\D/g, "")) -
          parseInt(a.quality.replace(/\D/g, ""))
      );

    // Deduplicate each category by quality label
    const dedup = <T extends { quality: string }>(arr: T[]): T[] => {
      const seen = new Set<string>();
      return arr.filter((f) => {
        if (seen.has(f.quality)) return false;
        seen.add(f.quality);
        return true;
      });
    };

    const formats = [
      ...dedup(combined),
      ...dedup(videoOnly),
      ...dedup(audioOnly).slice(0, 2),
    ];

    if (formats.length === 0) {
      return NextResponse.json(
        { error: "No downloadable formats found for this video." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      title: info.title ?? "Untitled",
      author: info.uploader ?? info.channel ?? "Unknown",
      lengthSeconds: String(info.duration ?? 0),
      thumbnail: info.thumbnail ?? "",
      viewCount: String(info.view_count ?? 0),
      formats,
    });
  } catch (error) {
    console.error("Error fetching video info:", error);
    return NextResponse.json(
      {
        error:
          "Failed to fetch video information. Please check the URL and try again.",
      },
      { status: 500 }
    );
  }
}
