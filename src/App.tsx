/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import type { VisualReferenceItem, WorkspaceProject } from '../backend/types';
import {
  createWorkspaceApi,
  deleteWorkspaceApi,
  fetchReferences,
  fetchWorkspaces,
} from './lib/api';
import { TopBar, type NavTab } from './components/TopBar';
import { StudioWorkspace } from './components/StudioWorkspace';
import { ThreeStudioStage } from './components/ThreeStudioStage';
import { AiCreativeLab } from './components/AiCreativeLab';
import { McpAndApiConsole } from './components/McpAndApiConsole';
import { WorkspaceHistory } from './components/WorkspaceHistory';
import { FeedbackPage } from './components/FeedbackPage';

function resolveInitialTab(): NavTab {
  if (typeof window !== 'undefined') {
    const p = window.location.pathname.toLowerCase();
    if (p.includes('review-feedback')) return 'feedback';
    if (p.includes('mcp')) return 'mcp-api';
    if (p.includes('3d')) return '3d-stage';
    if (p.includes('ai-lab')) return 'ai-lab';
  }
  return 'studio';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>(resolveInitialTab);
  const [workspaces, setWorkspaces] = useState<WorkspaceProject[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceProject | null>(null);
  const [references, setReferences] = useState<VisualReferenceItem[]>([]);
  const [accentColor, setAccentColor] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('clippah_accent') || '#f97316';
    }
    return '#f97316';
  });

  useEffect(() => {
    const hoverMap: Record<string, string> = {
      '#f97316': '#ea580c',
      '#06b6d4': '#0891b2',
      '#10b981': '#059669',
      '#ef4444': '#dc2626',
      '#6366f1': '#4f46e5',
    };
    document.documentElement.style.setProperty('--accent', accentColor);
    document.documentElement.style.setProperty('--accent-hover', hoverMap[accentColor] || '#ea580c');
    document.documentElement.style.setProperty('--accent-soft', `${accentColor}24`);
    localStorage.setItem('clippah_accent', accentColor);
  }, [accentColor]);

  useEffect(() => {
    let mounted = true;
    async function boot() {
      try {
        const [refRes, wsRes] = await Promise.all([fetchReferences(), fetchWorkspaces()]);
        if (!mounted) return;
        setReferences(refRes.references);
        if (wsRes.workspaces.length > 0) {
          setWorkspaces(wsRes.workspaces);
          setActiveWorkspace(wsRes.workspaces[0]);
        } else {
          const created = await createWorkspaceApi({
            category: 'Funniest Animal Moments',
            aspectRatio: '9:16',
          });
          if (!mounted) return;
          setWorkspaces([created.workspace]);
          setActiveWorkspace(created.workspace);
        }
      } catch (err) {
        console.error('Failed to initialize CLIPPAH studio:', err);
      }
    }
    boot();
    return () => {
      mounted = false;
    };
  }, []);

  function handleSelectTab(tab: NavTab) {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const nextUrl = tab === 'feedback' ? '/review-feedback/' : '/';
      if (window.location.pathname !== nextUrl) {
        window.history.pushState({}, '', nextUrl);
      }
    }
  }

  async function handleNewWorkspace() {
    try {
      const created = await createWorkspaceApi({
        category: 'Funniest Animal Moments',
        aspectRatio: '9:16',
      });
      setWorkspaces((prev) => [created.workspace, ...prev]);
      setActiveWorkspace(created.workspace);
      handleSelectTab('studio');
    } catch (err) {
      console.error('Create workspace failed:', err);
    }
  }

  function handleWorkspaceUpdated(updated: WorkspaceProject) {
    setActiveWorkspace(updated);
    setWorkspaces((prev) => {
      const exists = prev.some((w) => w.uuid === updated.uuid);
      if (!exists) return [updated, ...prev];
      return prev.map((w) => (w.uuid === updated.uuid ? updated : w));
    });
  }

  async function handleDeleteWorkspace(uuid: string) {
    try {
      await deleteWorkspaceApi(uuid);
      const remaining = workspaces.filter((w) => w.uuid !== uuid);
      setWorkspaces(remaining);
      if (activeWorkspace?.uuid === uuid) {
        if (remaining.length > 0) {
          setActiveWorkspace(remaining[0]);
        } else {
          await handleNewWorkspace();
        }
      }
    } catch (err) {
      console.error('Delete workspace failed:', err);
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0D12] text-slate-100 flex flex-col">
      <TopBar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onNewWorkspace={handleNewWorkspace}
      />

      <main className="flex-1">
        {activeTab === 'studio' && (
          <StudioWorkspace
            workspace={activeWorkspace}
            references={references}
            accentColor={accentColor}
            onChangeAccent={(hex) => setAccentColor(hex)}
            onWorkspaceUpdated={handleWorkspaceUpdated}
            onOpenHistory={() => handleSelectTab('history')}
          />
        )}

        {activeTab === 'ai-lab' && (
          <AiCreativeLab
            workspace={activeWorkspace}
            references={references}
            onWorkspaceUpdated={handleWorkspaceUpdated}
          />
        )}

        {activeTab === '3d-stage' && (
          <ThreeStudioStage
            workspace={activeWorkspace}
            accentColor={accentColor}
          />
        )}

        {activeTab === 'mcp-api' && (
          <McpAndApiConsole activeWorkspaceUuid={activeWorkspace?.uuid} />
        )}

        {activeTab === 'history' && (
          <WorkspaceHistory
            workspaces={workspaces}
            activeUuid={activeWorkspace?.uuid}
            onSelectWorkspace={(ws) => {
              setActiveWorkspace(ws);
              handleSelectTab('studio');
            }}
            onDeleteWorkspace={handleDeleteWorkspace}
          />
        )}

        {activeTab === 'feedback' && (
          <FeedbackPage activeWorkspaceUuid={activeWorkspace?.uuid} />
        )}
      </main>

      {activeTab !== '3d-stage' && (
        <footer className="border-t border-white/10 px-4 py-5 text-xs text-slate-500 sm:px-8">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4">
            <span>CLIPPAH BY YUANGAMES77 — Automated AI Video Clipping, Ranking & MCP Studio</span>
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => handleSelectTab('history')}
                className="hover:text-slate-300 cursor-pointer"
              >
                Workspace History
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('mcp-api')}
                className="hover:text-slate-300 cursor-pointer"
              >
                MCP & API Docs
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('feedback')}
                className="hover:text-slate-300 cursor-pointer"
              >
                Review & Feedback
              </button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
