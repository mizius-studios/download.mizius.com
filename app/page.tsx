"use client";

import { useState, useRef } from "react";

interface VideoFormat {
  formatId: string;
  quality: string;
  ext: string;
  filesize: number | null;
  type: "video" | "video-only" | "audio";
}

interface VideoInfo {
  title: string;
  author: string;
  lengthSeconds: string;
  thumbnail: string;
  viewCount: string;
  formats: VideoFormat[];
}

function formatDuration(seconds: string): string {
  const s = parseInt(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatViews(views: string): string {
  const n = parseInt(views);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [cookies, setCookies] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [downloading, setDownloading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchInfo = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setVideoInfo(null);
    setSelectedIndex(0);

    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), cookies }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      setVideoInfo(data);
    } catch {
      setError("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!videoInfo || videoInfo.formats.length === 0) return;
    setDownloading(true);

    const selected = videoInfo.formats[selectedIndex];
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/download";
    form.enctype = "application/x-www-form-urlencoded";
    form.style.display = "none";

    const fields = {
      url: url.trim(),
      formatId: selected.formatId,
      type: selected.type,
      ext: selected.ext,
      cookies,
    };

    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);

    setTimeout(() => setDownloading(false), 3000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") fetchInfo();
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="max-w-[720px] mx-auto w-full px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--bg)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2l0 20" />
                <path d="M5 9l7 7 7-7" />
              </svg>
            </div>
            <span className="font-medium text-[15px] tracking-[-0.01em] text-[var(--text-primary)]">
              mizius<span className="text-[var(--text-tertiary)]">/</span>
              download
            </span>
          </div>
          <a
            href="https://mizius.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            mizius.com
          </a>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-start pt-[clamp(48px,12vh,120px)] pb-16 px-6">
        <div className="max-w-[720px] w-full">
          {/* Hero */}
          <div className="mb-10">
            <h1 className="text-[clamp(28px,4vw,36px)] font-semibold tracking-[-0.03em] leading-[1.15] text-[var(--text-primary)] mb-3">
              Download videos
            </h1>
            <p className="text-[16px] leading-[1.6] text-[var(--text-secondary)] max-w-[480px]">
              Paste a YouTube link below to fetch available formats and download
              the video directly to your device.
            </p>
          </div>

          {/* Input area */}
          <div className="mb-8">
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full h-12 px-4 rounded-xl bg-[var(--input-bg)] border border-[var(--border)] text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)] transition-all"
                  />
                </div>
                <button
                  onClick={fetchInfo}
                  disabled={loading || !url.trim()}
                  className="h-12 px-6 rounded-xl bg-[var(--accent)] text-[var(--accent-text)] text-[15px] font-medium hover:brightness-[0.92] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 shrink-0 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-[var(--accent-text)]/30 border-t-[var(--accent-text)] rounded-full animate-spin" />
                      Fetching...
                    </>
                  ) : (
                    "Fetch"
                  )}
                </button>
              </div>

              <div>
                <textarea
                  value={cookies}
                  onChange={(e) => setCookies(e.target.value)}
                  placeholder={`# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t...\tSID\t...`}
                  className="w-full min-h-[160px] px-4 py-3 rounded-xl bg-[var(--input-bg)] border border-[var(--border)] text-[14px] leading-[1.55] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)] transition-all font-mono"
                />
                <p className="mt-2 text-[12px] leading-[1.5] text-[var(--text-tertiary)]">
                  Optional. Paste a Netscape cookie export here if YouTube asks
                  for confirmation or the video requires an authenticated
                  session.
                </p>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-8 p-4 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[14px] leading-[1.5]">
              {error}
            </div>
          )}

          {/* Video info card */}
          {videoInfo && (
            <div className="animate-in">
              <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--card-bg)]">
                {/* Thumbnail */}
                <div className="relative aspect-video bg-[var(--subtle-bg)] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={videoInfo.thumbnail}
                    alt={videoInfo.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-3 right-3 bg-black/75 text-white text-[12px] font-mono px-2 py-0.5 rounded-md">
                    {formatDuration(videoInfo.lengthSeconds)}
                  </div>
                </div>

                {/* Details */}
                <div className="p-5">
                  <h2 className="text-[17px] font-semibold leading-[1.35] text-[var(--text-primary)] mb-1.5 tracking-[-0.01em]">
                    {videoInfo.title}
                  </h2>
                  <div className="flex items-center gap-2 text-[13px] text-[var(--text-tertiary)] mb-5">
                    <span>{videoInfo.author}</span>
                    <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)] opacity-50" />
                    <span>{formatViews(videoInfo.viewCount)}</span>
                  </div>

                  {/* Format selector */}
                  <div className="mb-4">
                    <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-2 uppercase tracking-[0.04em]">
                      Format
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {videoInfo.formats.map((f, i) => (
                        <button
                          key={`${f.type}-${f.formatId}-${i}`}
                          onClick={() => setSelectedIndex(i)}
                          className={`h-9 px-4 rounded-lg text-[13px] font-medium border transition-all cursor-pointer ${
                            selectedIndex === i
                              ? "bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)]"
                              : "bg-[var(--subtle-bg)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--text-tertiary)]"
                          }`}
                        >
                          {f.quality}
                          {f.filesize ? (
                            <span className="ml-1.5 opacity-60">
                              {formatBytes(f.filesize)}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Download button */}
                  <button
                    onClick={handleDownload}
                    disabled={downloading || videoInfo.formats.length === 0}
                    className="w-full h-12 rounded-xl bg-[var(--text-primary)] text-[var(--bg)] text-[15px] font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    {downloading ? (
                      <>
                        <span className="inline-block w-4 h-4 border-2 border-[var(--bg)]/30 border-t-[var(--bg)] rounded-full animate-spin" />
                        Starting download...
                      </>
                    ) : (
                      <>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)]">
        <div className="max-w-[720px] mx-auto w-full px-6 py-5 flex items-center justify-between text-[13px] text-[var(--text-tertiary)]">
          <span>download.mizius.com</span>
          <span>For personal use only</span>
        </div>
      </footer>
    </div>
  );
}

