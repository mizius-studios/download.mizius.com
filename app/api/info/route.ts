import { NextRequest, NextResponse } from "next/server";
import { getYtDlp } from "@/app/lib/ytdlp";
import { createCookiesTempFile } from "@/app/lib/cookies";
import {
  buildCookieAuthInstructions,
  isCookieAuthRequiredError,
} from "@/app/lib/errors";

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
    const { url, cookies } = await request.json();

    if (!url || !YOUTUBE_URL_RE.test(url)) {
      return NextResponse.json(
        { error: "Please provide a valid YouTube URL." },
        { status: 400 }
      );
    }

    const ytdlp = await getYtDlp();
    const cookieFile = cookies ? await createCookiesTempFile(cookies) : null;

    try {
      const cookieOptions = cookieFile ? { cookies: cookieFile.path } : undefined;
      const [infoRaw, formatsRaw] = await Promise.all([
        ytdlp.getInfoAsync(url, cookieOptions),
        ytdlp.getFormatsAsync(url, cookieOptions),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info = infoRaw as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allFormats = ((formatsRaw as any).formats ?? formatsRaw) as YtFormat[];

      const qualityFrom = (f: YtFormat) => `${f.height}p${f.format_note?.includes("60") ? "60" : ""}`;

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
          quality: `${qualityFrom(f)} - MP4 (video + audio)` ,
          ext: f.ext,
          filesize: f.filesize ?? f.filesize_approx ?? null,
          type: "video" as const,
          sortHeight: f.height ?? 0,
        }))
        .sort((a, b) => b.sortHeight - a.sortHeight);

      // Video-only (mp4 with avc1) - merge with bestaudio during download
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
          quality: `${qualityFrom(f)} - MP4 (merged with audio)` ,
          ext: "mp4",
          filesize: f.filesize ?? f.filesize_approx ?? null,
          type: "video-only" as const,
          sortHeight: f.height ?? 0,
        }))
        .sort((a, b) => b.sortHeight - a.sortHeight);

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
          quality: `Audio ${Math.round(f.abr ?? 0)}kbps - ${f.ext.toUpperCase()}`,
          ext: f.ext,
          filesize: f.filesize ?? f.filesize_approx ?? null,
          type: "audio" as const,
          sortAbr: f.abr ?? 0,
        }))
        .sort((a, b) => b.sortAbr - a.sortAbr);

      // Deduplicate by a stable key that keeps quality and type distinct.
      const dedupBy = <T extends { quality: string; type: string }>(arr: T[]): T[] => {
        const seen = new Set<string>();
        return arr.filter((f) => {
          const key = `${f.type}:${f.quality}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };

      const formats = [
        ...dedupBy(combined),
        ...dedupBy(videoOnly),
        ...dedupBy(audioOnly).slice(0, 3),
      ].map((format) => ({
        formatId: format.formatId,
        quality: format.quality,
        ext: format.ext,
        filesize: format.filesize,
        type: format.type,
      }));

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
    } finally {
      if (cookieFile) {
        await cookieFile.cleanup();
      }
    }
  } catch (error) {
    console.error("Error fetching video info:", error);
    const rawMessage =
      error instanceof Error ? error.message : "Failed to fetch video information.";
    const needsCookieAuth = isCookieAuthRequiredError(rawMessage);
    const message = needsCookieAuth
      ? buildCookieAuthInstructions(rawMessage)
      : rawMessage;
    const status = needsCookieAuth || rawMessage.includes("Cookies must") ? 400 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
