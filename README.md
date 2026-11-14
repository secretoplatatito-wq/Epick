# CLIPPAH BY YUANGAMES77

**AI Connects. AI Analyzes. AI Ranks. AI Edits. AI Renders. CLIPPAH Delivers.**

CLIPPAH BY YUANGAMES77 is a full-stack automated AI video clipping, ranking, editing, 3D visual reference staging, and Model Context Protocol (MCP) platform.

## Capabilities

- **Autonomous Video Pipeline**: FFprobe metadata inspection, FFmpeg scene boundary detection, JPEG keyframe extraction, audio peak measurement, AI moment ranking (`#10` down to `#1`), viral title generation, and real MP4 compilation rendering (`9:16`, `16:9`, `1:1`).
- **Official MCP Server (`/api/mcp/`)**: JSON-RPC 2.0 over HTTP with Bearer token auth exposing 34+ real tools, resources, and prompts.
- **UUID Workspaces**: Every project receives a cryptographic UUID with persistent files, HTML5 Range-enabled `/preview/`, and attachment `/download/` endpoints.
- **Visual Reference Engine & 3D Broadcast Stage**: Generated reference layout templates plus an interactive Three.js PBR studio monitor & camera rig stage.
- **AI Creative Lab**: Gemini multimodal image understanding, aspect-ratio reference generation (`1:1` through `21:9`), Interactions API image-to-video animation (with FFmpeg Ken Burns MP4 fallback), Google Search trend grounding, and High-Thinking editorial strategy.
- **Review & Feedback (`/review-feedback/`)**: Interactive 5-star rating system with server-side validation, anti-spam protection, and SMTP/webhook routing to `retroplasmman@gmail.com`.

## Quick Start

1. Install dependencies (requires Node.js 20+ and `ffmpeg` / `ffprobe` on `PATH`):
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and configure `GEMINI_API_KEY` and optional SMTP/webhook settings.
3. Run development server (Express + Vite on port 3000):
   ```bash
   npm run dev
   ```
4. Run unit tests & typecheck:
   ```bash
   npm test
   npm run lint
   ```
5. Build & run production server:
   ```bash
   npm run build
   npm start
   ```

## Documentation

- [API Reference](./docs/API.md)
- [MCP Integration Guide](./docs/MCP.md)
- [Deployment Guide (GitHub Pages + Node/FFmpeg Backend)](./docs/DEPLOYMENT.md)
- [System Architecture](./docs/ARCHITECTURE.md)
