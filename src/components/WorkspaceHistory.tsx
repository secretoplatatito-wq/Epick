import React, { useState } from 'react';
import { Trash2, ExternalLink, Download } from 'lucide-react';
import type { WorkspaceProject } from '../../backend/types';

interface WorkspaceHistoryProps {
  workspaces: WorkspaceProject[];
  activeUuid?: string;
  onSelectWorkspace: (ws: WorkspaceProject) => void;
  onDeleteWorkspace: (uuid: string) => void;
}

export const WorkspaceHistory: React.FC<WorkspaceHistoryProps> = ({
  workspaces,
  activeUuid,
  onSelectWorkspace,
  onDeleteWorkspace,
}) => {
  const [query, setQuery] = useState('');

  const filtered = workspaces.filter(
    (w) =>
      w.title.toLowerCase().includes(query.toLowerCase()) ||
      w.category.toLowerCase().includes(query.toLowerCase()) ||
      w.uuid.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-6 sm:px-8">
      <div className="mb-6 flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-slate-400">UUID Workspace Persistence</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-white">Workspace History</h1>
        </div>
        <input
          type="search"
          aria-label="Filter workspaces"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, category, or UUID..."
          className="h-10 w-full rounded-lg border border-white/10 bg-[#131722] px-3 text-xs text-white placeholder:text-slate-500 sm:w-72"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#131722] p-12 text-center text-sm text-slate-400">
          No matching workspaces found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#131722]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">UUID</th>
                <th className="px-4 py-3 font-medium text-right">Clips</th>
                <th className="px-4 py-3 font-medium">Render Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((ws) => {
                const isRendered = ws.exportMetadata.renderStatus === 'completed';
                return (
                  <tr
                    key={ws.uuid}
                    className={`hover:bg-white/[0.03] ${ws.uuid === activeUuid ? 'bg-[var(--accent-soft)]' : ''}`}
                  >
                    <td className="px-4 py-3 font-semibold text-white">{ws.title}</td>
                    <td className="px-4 py-3 text-slate-300">{ws.category}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{ws.uuid}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-200 tabular-nums">
                      {ws.clips.length}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          isRendered ? 'text-emerald-400 font-medium' : 'text-slate-400'
                        }
                      >
                        {ws.exportMetadata.renderStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectWorkspace(ws)}
                          className="rounded-md bg-[#0B0D12] px-2.5 py-1 text-xs font-medium text-white hover:bg-white/10 cursor-pointer"
                        >
                          Open
                        </button>
                        {isRendered && (
                          <>
                            <a
                              href={`/api/workspace/${encodeURIComponent(ws.uuid)}/preview/`}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Preview ${ws.title}`}
                              className="rounded p-1.5 text-slate-300 hover:bg-white/10"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <a
                              href={`/api/workspace/${encodeURIComponent(ws.uuid)}/download/`}
                              download
                              aria-label={`Download ${ws.title}`}
                              className="rounded p-1.5 text-emerald-400 hover:bg-white/10"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </>
                        )}
                        <button
                          type="button"
                          aria-label={`Delete workspace ${ws.title}`}
                          onClick={() => onDeleteWorkspace(ws.uuid)}
                          className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-red-400 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
