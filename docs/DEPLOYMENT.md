# Deployment Guide

GitHub Pages serves static assets only and cannot run Node.js servers, FFmpeg binaries, or the MCP server. Deploy CLIPPAH in two coordinated targets:

## 1. Backend Hosting (Node.js + FFmpeg)

Deploy `server.ts` / `server.js` to a container or Node.js host with `ffmpeg` and `ffprobe` installed (Cloud Run, Fly.io, Railway, Render, or VPS):

- Build command: `npm run build`
- Start command: `npm start`
- Required system binaries: `ffmpeg`, `ffprobe`
- Persistent volume mount: `.clippah_data/` (stores UUID workspaces, uploaded videos, keyframes, rendered MP4s, and feedback spool)
- Required env vars (see `.env.example`): `GEMINI_API_KEY`, `APP_URL`, `CLIPPAH_API_TOKEN`, `FEEDBACK_TO_EMAIL`, and optional `SMTP_*` or `FEEDBACK_WEBHOOK_URL`.

## 2. Static Frontend (GitHub Pages Compatible)

- Run `vite build` to output static HTML/CSS/JS into `dist/`.
- Deploy `dist/` to GitHub Pages, Cloudflare Pages, or Vercel, and route `/api/*` requests to your deployed Node.js + FFmpeg backend URL via reverse proxy or `APP_URL` configuration.
