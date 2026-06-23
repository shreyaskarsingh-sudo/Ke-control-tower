import { Bell, Search, RefreshCw, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import type { Escalation } from "@/types";
import { Mail, MessageSquare, Ticket } from "lucide-react";
import { timeAgo } from "@/lib/utils";

const SOURCE_ICON: Record<string, React.ElementType> = {
  gmail: Mail,
  slack: MessageSquare,
  jira: Ticket,
};

interface HeaderProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  searchData?: Escalation[];
  onSelectResult?: (e: Escalation) => void;
}

export function Header({ title, subtitle, onRefresh, searchData = [], onSelectResult }: HeaderProps) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const results = query.trim().length >= 2
    ? searchData
        .filter((e) => {
          const q = query.toLowerCase();
          return (
            e.subject.toLowerCase().includes(q) ||
            e.snippet.toLowerCase().includes(q) ||
            e.merchantName.toLowerCase().includes(q)
          );
        })
        .slice(0, 8)
    : [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="flex items-center justify-between px-8 py-4 bg-surface-container-lowest border-b border-outline-variant/30 shrink-0">
      <div>
        <h1 className="text-xl font-bold font-headline text-on-surface">{title}</h1>
        {subtitle && (
          <p className="text-sm text-on-surface-variant mt-0.5">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div ref={wrapperRef} className="relative">
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container transition-all duration-200 ${
              searching ? "w-72" : "w-44"
            }`}
          >
            <Search size={15} className="text-on-surface-variant shrink-0" />
            <input
              type="text"
              placeholder="Search across Email, Slack, Jira..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
              onFocus={() => { setSearching(true); setShowResults(true); }}
              onBlur={() => setSearching(false)}
              className="flex-1 bg-transparent text-sm text-on-surface placeholder-on-surface-variant/60 outline-none min-w-0"
            />
            {query && (
              <button onClick={() => { setQuery(""); setShowResults(false); }} className="text-on-surface-variant hover:text-on-surface">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Search results dropdown */}
          {showResults && query.trim().length >= 2 && (
            <div className="absolute top-full right-0 mt-1 w-[420px] bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/20 z-50 overflow-hidden max-h-80 overflow-y-auto">
              {results.length === 0 ? (
                <div className="px-4 py-3 text-sm text-on-surface-variant text-center">No results for &quot;{query}&quot;</div>
              ) : (
                results.map((e) => {
                  const Icon = SOURCE_ICON[e.source] ?? Mail;
                  return (
                    <button
                      key={e.id}
                      onMouseDown={() => { onSelectResult?.(e); setShowResults(false); setQuery(""); }}
                      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-surface-container text-left border-b border-outline-variant/10 last:border-0 transition-colors"
                    >
                      <Icon size={14} className="text-on-surface-variant mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">{e.subject}</p>
                        <p className="text-xs text-on-surface-variant truncate mt-0.5">{e.snippet}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs capitalize text-on-surface-variant bg-surface-container rounded px-1.5 py-0.5">{e.source}</span>
                        <p className="text-xs text-on-surface-variant mt-1">{timeAgo(e.lastMessageAt)}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Refresh */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        )}

        {/* Notifications */}
        <button className="relative p-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors">
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full" />
        </button>
      </div>
    </header>
  );
}
