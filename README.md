<h1 align="center">
  <br>
  Vidra
  <br>
</h1>

<h4 align="center">A clean web app for fetching YouTube video metadata and downloading videos or audio in the format you choose.</h4>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="yt-dlp" src="https://img.shields.io/badge/yt--dlp-powered-red?style=flat-square">
</p>

## Overview

Vidra is a Next.js YouTube downloader interface powered by `yt-dlp`. Paste a YouTube URL, fetch available metadata and formats, optionally provide exported session cookies for restricted videos, and download the selected video or audio stream directly from the browser.

The app is designed to be lightweight, private, and straightforward. All download work is handled server-side through API routes, while the frontend provides a minimal format picker and theme-aware UI.

## Features

- Fetches video title, channel, duration, thumbnail, view count, and available formats.
- Downloads combined video/audio, video-only streams merged with best audio, or audio-only formats.
- Supports MP4, WebM, M4A, MP3, and related output MIME handling.
- Accepts Netscape-format YouTube cookie exports for authenticated or restricted videos.
- Stores pasted cookies locally in the browser for convenience.
- Uses temporary server-side files and cleans them up after streaming downloads.
- Includes a clean responsive UI with dark-mode support.
- Provides clearer instructions when YouTube requires signed-in cookie authentication.

## Requirements

- Node.js compatible with Next.js 16.
- npm.
- Network access from the server to YouTube.
- A working `yt-dlp` runtime through `ytdlp-nodejs`.

## Setup

Install dependencies and start the development server.

```sh
npm install
npm run dev
```

Open the local Next.js URL printed by the dev server, usually `http://localhost:3000`.

## Usage

1. Paste a supported YouTube URL, including regular videos, short links, or Shorts.
2. Optionally paste a Netscape cookie export if the video requires an authenticated session.
3. Click **Fetch** to load video information and available formats.
4. Pick a format.
5. Click **Download**.

Supported URL patterns include.

```txt
https://www.youtube.com/watch?v=...
https://youtu.be/...
https://www.youtube.com/shorts/...
```

## Cookie authentication

Some videos require a signed-in YouTube session. Vidra accepts cookies in Netscape HTTP Cookie File format and passes them to `yt-dlp` only for the current metadata or download request.

Cookies are normalized and written to temporary files on the server, then removed after use. The browser stores the pasted cookie text in local storage so you do not need to paste it again on every request.

## Development

Build the production app.

```sh
npm run build
```

Start a production build.

```sh
npm start
```

Project entry points.

- Frontend page - `app/page.tsx`
- Metadata API - `app/api/info/route.ts`
- Download API - `app/api/download/route.ts`

## Disclaimer

Vidra is for personal use only. Respect copyright laws, platform terms, and the rights of content owners.
