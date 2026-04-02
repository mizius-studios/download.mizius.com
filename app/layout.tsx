import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "download.mizius.com",
  description:
    "Download YouTube videos in your preferred format. Paste a link, pick a quality, and save it directly to your device.",
};

const themeScript = `
  (function() {
    try {
      var theme = localStorage.getItem('theme');
      if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    } catch(e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head />
      <body className="min-h-full flex flex-col">
        <Script id="theme-init" strategy="beforeInteractive">{themeScript}</Script>
        {children}
      </body>
    </html>
  );
}
