import test from 'node:test';
import assert from 'node:assert/strict';
import { MCP_TOOLS, handleMcpJsonRpc } from '../mcp/server';

test('MCP server initializes and returns protocol capabilities', async () => {
  const res = await handleMcpJsonRpc(
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    'http://localhost:3000',
    'test-actor'
  );
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 1);
  const result = res.result as { protocolVersion: string; serverInfo: { name: string } };
  assert.equal(result.protocolVersion, '2024-11-05');
  assert.equal(result.serverInfo.name, 'clippah-by-yuangames77');
});

test('MCP tools/list exposes complete documented video, AI, editing, workspace, and feedback toolset', async () => {
  const res = await handleMcpJsonRpc(
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    'http://localhost:3000',
    'test-actor'
  );
  const tools = (res.result as { tools: typeof MCP_TOOLS }).tools;
  const names = new Set(tools.map((t) => t.name));

  for (const required of [
    'inspect_video',
    'detect_scenes',
    'extract_keyframes',
    'analyze_visual_content',
    'generate_ranking',
    'generate_viral_title',
    'trim_clip',
    'render_video',
    'create_workspace',
    'get_video_preview',
    'export_video',
    'submit_feedback',
  ]) {
    assert.ok(names.has(required), `Missing required MCP tool: ${required}`);
  }
});

test('MCP tools/call executes list_visual_references and returns structured JSON content', async () => {
  const res = await handleMcpJsonRpc(
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_visual_references', arguments: {} },
    },
    'http://localhost:3000',
    'test-actor'
  );
  const result = res.result as { content: Array<{ type: string; text: string }> };
  assert.equal(result.content[0].type, 'text');
  const parsed = JSON.parse(result.content[0].text) as { references: Array<{ id: string }> };
  assert.ok(parsed.references.length >= 4);
});
