import React, { useEffect, useState } from 'react';
import { Copy, Check, Terminal, Play } from 'lucide-react';
import type { ProviderDefinition } from '../../backend/types';
import {
  callMcpRpcApi,
  fetchProviders,
  fetchSessionInfo,
  type SessionInfo,
} from '../lib/api';

interface McpAndApiConsoleProps {
  activeWorkspaceUuid?: string;
}

const API_ENDPOINTS = [
  { method: 'GET / POST', path: '/api/mcp/', purpose: 'Official MCP JSON-RPC 2.0 discovery & tool execution endpoint' },
  { method: 'GET', path: '/api/workspace/', purpose: 'List authorized UUID workspaces' },
  { method: 'POST', path: '/api/workspace/create/', purpose: 'Create a new UUID workspace project' },
  { method: 'GET / PATCH', path: '/api/workspace/{uuid}/', purpose: 'Retrieve or update workspace state and overlay config' },
  { method: 'GET', path: '/api/workspace/{uuid}/preview/', purpose: 'Stream rendered MP4 directly in browser with HTTP Range support' },
  { method: 'GET', path: '/api/workspace/{uuid}/download/', purpose: 'Download completed MP4 compilation as attachment' },
  { method: 'POST', path: '/api/video/analyze/', purpose: 'Run FFprobe + scene detection + keyframe extraction + AI ranking' },
  { method: 'POST', path: '/api/video/scenes/', purpose: 'Detect FFmpeg scene boundaries and audio peaks' },
  { method: 'POST', path: '/api/video/clips/', purpose: 'Edit clip trim timestamps, captions, scores, and transitions' },
  { method: 'POST', path: '/api/video/ranking/', purpose: 'Reorder clips in countdown (#10 to #1) or top-first sequence' },
  { method: 'POST', path: '/api/video/render/', purpose: 'Render finished 9:16, 16:9, or 1:1 MP4 compilation via FFmpeg' },
  { method: 'POST', path: '/api/ai/title/', purpose: 'Autonomously generate and select viral title candidates' },
  { method: 'POST', path: '/api/ai/captions/', purpose: 'Update dynamic overlay captions' },
  { method: 'POST', path: '/api/ai/visual-analysis/', purpose: 'Analyze reference image into overlay placement config' },
  { method: 'GET / POST', path: '/api/review-feedback/', purpose: 'Submit validated 5-star review feedback to retroplasmman@gmail.com' },
];

export const McpAndApiConsole: React.FC<McpAndApiConsoleProps> = ({ activeWorkspaceUuid }) => {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [providers, setProviders] = useState<ProviderDefinition[]>([]);
  const [rpcMethod, setRpcMethod] = useState<string>('tools/list');
  const [toolName, setToolName] = useState<string>('list_visual_references');
  const [toolArgsJson, setToolArgsJson] = useState<string>('{}');
  const [rpcOutput, setRpcOutput] = useState<string>('');
  const [rpcBusy, setRpcBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchSessionInfo().then(setSession).catch(() => {});
    fetchProviders().then((r) => setProviders(r.providers)).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeWorkspaceUuid && toolName === 'get_workspace') {
      setToolArgsJson(JSON.stringify({ uuid: activeWorkspaceUuid }, null, 2));
    }
  }, [activeWorkspaceUuid, toolName]);

  const mcpConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        'clippah-by-yuangames77': {
          url: session?.mcpEndpoint || `${window.location.origin}/api/mcp/`,
          transport: 'http',
          headers: {
            Authorization: `Bearer ${session?.mcpToken || '<CLIPPAH_API_TOKEN>'}`,
          },
        },
      },
    },
    null,
    2
  );

  async function handleCopyConfig() {
    try {
      await navigator.clipboard.writeText(mcpConfigSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Ignore clipboard failure
    }
  }

  async function handleRunRpc() {
    setRpcBusy(true);
    try {
      let params: Record<string, unknown> = {};
      if (rpcMethod === 'tools/call') {
        const parsedArgs = JSON.parse(toolArgsJson || '{}');
        params = { name: toolName, arguments: parsedArgs };
      }
      const res = await callMcpRpcApi(rpcMethod, params);
      setRpcOutput(JSON.stringify(res, null, 2));
    } catch (err) {
      setRpcOutput(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2));
    } finally {
      setRpcBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-6 sm:px-8">
      <div className="mb-6 border-b border-white/10 pb-5">
        <p className="text-xs text-slate-400">
          Model Context Protocol (JSON-RPC 2.0) · REST API Namespace · Provider Ecosystem
        </p>
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
          MCP Server & API Ecosystem
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* MCP Client Config + Live Explorer */}
        <div className="space-y-6 lg:col-span-6">
          <div className="rounded-xl border border-white/10 bg-[#131722] p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-white">
                01. MCP Client Configuration
              </h2>
              <button
                type="button"
                onClick={handleCopyConfig}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0B0D12] px-3 py-1.5 text-xs font-medium text-white hover:border-white/25 cursor-pointer"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy JSON'}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Connect Claude Desktop, Cursor, or any MCP HTTP client to <span className="font-mono text-slate-200">/api/mcp/</span>.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-[#0B0D12] p-3.5 font-mono text-xs text-slate-200">
              {mcpConfigSnippet}
            </pre>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#131722] p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
              <Terminal className="h-4 w-4 text-[var(--accent)]" />
              02. Live MCP JSON-RPC 2.0 Tester
            </h2>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="mcp-method" className="block text-xs text-slate-400">
                  MCP Method
                </label>
                <select
                  id="mcp-method"
                  value={rpcMethod}
                  onChange={(e) => setRpcMethod(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-[#0B0D12] px-2.5 font-mono text-xs text-white"
                >
                  <option value="initialize">initialize</option>
                  <option value="tools/list">tools/list</option>
                  <option value="resources/list">resources/list</option>
                  <option value="prompts/list">prompts/list</option>
                  <option value="tools/call">tools/call</option>
                </select>
              </div>

              {rpcMethod === 'tools/call' && (
                <div>
                  <label htmlFor="mcp-tool-name" className="block text-xs text-slate-400">
                    Tool Name
                  </label>
                  <select
                    id="mcp-tool-name"
                    value={toolName}
                    onChange={(e) => {
                      const next = e.target.value;
                      setToolName(next);
                      if (next === 'create_workspace') {
                        setToolArgsJson(JSON.stringify({ category: 'Funniest Animal Moments', attachSamplePreset: 'funny-animals-compilation' }, null, 2));
                      } else if (activeWorkspaceUuid) {
                        setToolArgsJson(JSON.stringify({ uuid: activeWorkspaceUuid }, null, 2));
                      } else {
                        setToolArgsJson('{}');
                      }
                    }}
                    className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-[#0B0D12] px-2.5 font-mono text-xs text-white"
                  >
                    <option value="list_visual_references">list_visual_references</option>
                    <option value="list_providers">list_providers</option>
                    <option value="create_workspace">create_workspace</option>
                    <option value="get_workspace">get_workspace</option>
                    <option value="inspect_video">inspect_video</option>
                    <option value="detect_scenes">detect_scenes</option>
                    <option value="analyze_visual_content">analyze_visual_content</option>
                    <option value="generate_viral_title">generate_viral_title</option>
                    <option value="render_video">render_video</option>
                    <option value="get_feedback_schema">get_feedback_schema</option>
                  </select>
                </div>
              )}
            </div>

            {rpcMethod === 'tools/call' && (
              <div className="mt-3">
                <label htmlFor="mcp-args" className="block text-xs text-slate-400">
                  Arguments JSON
                </label>
                <textarea
                  id="mcp-args"
                  rows={3}
                  value={toolArgsJson}
                  onChange={(e) => setToolArgsJson(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#0B0D12] p-2.5 font-mono text-xs text-slate-200"
                />
              </div>
            )}

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleRunRpc}
                disabled={rpcBusy}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5" />
                {rpcBusy ? 'Executing...' : 'Execute MCP Call'}
              </button>
            </div>

            {rpcOutput && (
              <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-white/10 bg-[#0B0D12] p-3 font-mono text-[11px] text-emerald-300">
                {rpcOutput}
              </pre>
            )}
          </div>
        </div>

        {/* REST API Catalog & Provider Ecosystem */}
        <div className="space-y-6 lg:col-span-6">
          <div className="rounded-xl border border-white/10 bg-[#131722] p-5">
            <h2 className="font-display text-base font-semibold text-white">
              03. Authenticated REST API Endpoints
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="py-2 pr-3 font-medium">Method</th>
                    <th className="py-2 pr-3 font-medium">Endpoint</th>
                    <th className="py-2 font-medium">Operation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {API_ENDPOINTS.map((ep) => (
                    <tr key={ep.path} className="hover:bg-white/[0.02]">
                      <td className="py-2 pr-3 font-mono text-[11px] text-[var(--accent)] whitespace-nowrap">
                        {ep.method}
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px] text-white whitespace-nowrap">
                        {ep.path}
                      </td>
                      <td className="py-2 text-slate-300">{ep.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#131722] p-5">
            <h2 className="font-display text-base font-semibold text-white">
              04. Provider-Independent AI & Processing Ecosystem
            </h2>
            <div className="mt-3 space-y-2.5">
              {providers.map((p) => (
                <div key={p.id} className="rounded-lg border border-white/10 bg-[#0B0D12] p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-white">{p.name}</span>
                    <span className={p.available ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
                      {p.available ? 'Available' : 'Key Required / Fallback Active'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Auth: {p.authRequirement} · Limits: {p.freeTierLimitations}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">
                    Capabilities: {p.capabilities.join(', ')} {p.fallbackProviderId ? `· Fallback: ${p.fallbackProviderId}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
