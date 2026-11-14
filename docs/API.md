# CLIPPAH REST API Reference

Base Namespace: `/api/`

## Authentication

All private workspace, video processing, AI, and MCP routes enforce authentication:
- `Authorization: Bearer <CLIPPAH_API_TOKEN>` (for MCP agents & external scripts)
- Or `x-clippah-studio: 1` (same-origin authenticated studio UI)
- Missing credentials return `401 Unauthorized`; invalid tokens return `403 Forbidden`.

## Endpoints

- `GET / POST /api/mcp/` — Official MCP JSON-RPC 2.0 endpoint
- `GET /api/workspace/` — List authorized workspaces
- `POST /api/workspace/create/` — Create UUID workspace
- `GET / PATCH / DELETE /api/workspace/{uuid}/` — Workspace CRUD
- `GET /api/workspace/{uuid}/preview/` — HTTP Range-capable HTML5 video stream
- `GET /api/workspace/{uuid}/download/` — MP4 attachment download
- `POST /api/video/upload/` — Multipart video upload
- `POST /api/video/sample/` — Generate & attach FFmpeg multi-scene sample compilation
- `POST /api/video/analyze/` — FFprobe + scene detection + keyframes + AI ranking
- `POST /api/video/scenes/` — FFmpeg scene boundary extraction
- `POST /api/video/clips/` — Edit clip timestamps, captions, score, transitions
- `POST /api/video/ranking/` — Reorder countdown (`#N` to `#1`) or top-first
- `POST /api/video/render/` — Render finished MP4 (`9:16`, `16:9`, `1:1`)
- `POST /api/ai/title/` — Generate viral title candidates
- `POST /api/ai/captions/` — Update clip overlay caption
- `POST /api/ai/visual-analysis/` — Extract layout overlay placements from uploaded image
- `POST /api/ai/search-trends/` — Google Search grounded trend research
- `POST /api/ai/deep-strategy/` — ThinkingLevel.HIGH editorial pacing strategy
- `POST /api/ai/generate-image/` — Generate aspect-ratio reference graphics
- `POST /api/ai/animate-image/` — Animate image to `16:9` or `9:16` MP4
- `GET / POST /api/review-feedback/` — Submit 5-star review feedback routed to `retroplasmman@gmail.com`
