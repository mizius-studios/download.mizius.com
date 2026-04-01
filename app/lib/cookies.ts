import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const NETSCAPE_HEADER = "# Netscape HTTP Cookie File";

function isCookieRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return false;
  }

  return trimmed.split("\t").length >= 7;
}

export function normalizeNetscapeCookies(rawCookies: string): string {
  const trimmed = rawCookies.trim();

  if (!trimmed) {
    return "";
  }

  const lines = trimmed.split(/\r?\n/);
  const hasHeader = lines.some((line) => line.trim() === NETSCAPE_HEADER);
  const cookieRows = lines.filter(isCookieRow);

  if (cookieRows.length === 0) {
    throw new Error(
      "Cookies must be pasted in Netscape HTTP Cookie File format."
    );
  }

  const invalidRows = lines.filter((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return false;
    }

    return trimmedLine.split("\t").length < 7;
  });

  if (invalidRows.length > 0) {
    throw new Error(
      "Cookies must use tab-separated Netscape format lines with 7 fields."
    );
  }

  const normalized = hasHeader ? trimmed : `${NETSCAPE_HEADER}\n${trimmed}`;
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

export async function createCookiesTempFile(rawCookies: string): Promise<{
  path: string;
  cleanup: () => Promise<void>;
} | null> {
  const normalized = normalizeNetscapeCookies(rawCookies);

  if (!normalized) {
    return null;
  }

  const tempDir = await mkdtemp(join(tmpdir(), "download-mizius-cookies-"));
  const filePath = join(tempDir, "cookies.txt");

  await writeFile(filePath, normalized, "utf8");

  return {
    path: filePath,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}
