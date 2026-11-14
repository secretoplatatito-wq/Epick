# CLIPPAH System Architecture

- `src/` — React 19 + TypeScript + Tailwind CSS v4 + Three.js 3D Broadcast Stage UI
- `backend/` — Express middleware, UUID workspace store, sample MP4 generator, pipeline orchestration, and server-side feedback email/webhook service
- `mcp/` — Official MCP JSON-RPC 2.0 server exposing 34+ executable tools, resources, and prompts
- `video-engine/` — FFprobe metadata inspector, FFmpeg scene detector, keyframe extractor, deterministic ranking engine, and multi-clip MP4 composer
- `ai/` — Provider-independent registry, Visual Reference layout templates, and server-side `@google/genai` orchestration
- `tests/` — `node:test` deterministic unit test suite
