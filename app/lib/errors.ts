const cookieAuthPatterns = [
  "sign in to confirm",
  "use --cookies-from-browser",
  "use --cookies for the authentication",
  "how-do-i-pass-cookies-to-yt-dlp",
  "exporting-youtube-cookies",
  "cookies are required",
];

export function isCookieAuthRequiredError(message: string): boolean {
  const lower = message.toLowerCase();
  return cookieAuthPatterns.some((pattern) => lower.includes(pattern));
}

export function buildCookieAuthInstructions(originalError: string): string {
  return [
    "YouTube requires a signed-in session for this video.",
    "",
    "You have to export your youtube session cookies...",
    "1. Sign in to YouTube in your browser.",
    '2. Export cookies in Netscape/cookies.txt format (for example using the Cookie-Editor browser extension available at https://chromewebstore.google.com/detail/cookie-editor/).',
    "3. Copy the full exported cookies content.",
    "",
    "Then import the cookies here...",
    "4. Paste that full Netscape cookie text into the Cookies field.",
    "5. Click Fetch again.",
    "",
  ].join("\n");
}
