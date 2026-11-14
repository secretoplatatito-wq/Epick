import React from 'react';

export type NavTab = 'studio' | 'ai-lab' | '3d-stage' | 'mcp-api' | 'history' | 'feedback';

interface TopBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onNewWorkspace: () => void;
}

const NAV_ITEMS: Array<{ id: NavTab; label: string }> = [
  { id: 'studio', label: 'Studio' },
  { id: 'ai-lab', label: 'AI Lab' },
  { id: '3d-stage', label: '3D Stage' },
  { id: 'mcp-api', label: 'MCP & API' },
  { id: 'feedback', label: 'Feedback' },
];

export const TopBar: React.FC<TopBarProps> = ({ activeTab, onSelectTab, onNewWorkspace }) => {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0D12]/95 px-4 sm:px-8">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('studio');
          }}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          CLIPPAH
        </a>

        <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                  isActive ? 'text-white' : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute right-0 bottom-0 left-0 h-0.5 bg-[var(--accent)]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onNewWorkspace}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
          >
            New Workspace
          </button>
        </div>
      </div>

      {/* Mobile compact secondary nav row */}
      <nav aria-label="Mobile navigation" className="flex md:hidden items-center gap-4 overflow-x-auto pb-2.5">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`min-h-[40px] px-2 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                isActive ? 'text-white border-b-2 border-[var(--accent)]' : 'text-slate-400'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
