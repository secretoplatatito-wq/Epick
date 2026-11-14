# CLIPPAH Model Context Protocol (MCP) Guide

Endpoint: `<APP_URL>/api/mcp/`
Protocol: JSON-RPC 2.0 over HTTP (`2024-11-05`)

## Client Configuration

```json
{
  "mcpServers": {
    "clippah-by-yuangames77": {
      "url": "https://your-backend-host.example.com/api/mcp/",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer YOUR_CLIPPAH_API_TOKEN"
      }
    }
  }
}
```

## Supported Methods

- `initialize`
- `tools/list`
- `tools/call`
- `resources/list` (`clippah://references`, `clippah://providers`, `clippah://workspace/{uuid}`)
- `resources/read`
- `prompts/list` (`autonomous_ranking_director`, `viral_title_selector`, `reference_layout_matcher`)
- `prompts/get`

## Autonomous Agent Workflow

1. Call `create_workspace` (or attach uploaded video via `/api/video/upload/`).
2. Call `inspect_video` / `detect_scenes` / `extract_keyframes` or `analyze_visual_content`.
3. Refine clips with `trim_clip`, `add_title`, `add_ranking_number`, `add_captions`, `compose_ranking_video`.
4. Call `render_video` to stitch and encode the MP4 via FFmpeg.
5. Call `export_video` to verify output availability and return `WORKSPACE`, `PREVIEW`, and `DOWNLOAD` links.
