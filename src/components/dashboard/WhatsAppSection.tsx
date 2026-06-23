import { useState, useEffect, useRef } from "react";
import { MessageCircle, Clock, Sparkles, RefreshCw, AlertCircle, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface WaChat {
  chat_id: string;
  chat_name: string;
  status: string;
  message_unread_count: number;
  assigned_to?: string | null;
  latest_message?: { body?: string; timestamp?: number | string; from_me?: boolean; fromMe?: boolean };
}

function tsToMs(ts?: number | string): number {
  if (!ts) return 0;
  if (typeof ts === "string") { const ms = new Date(ts).getTime(); return isNaN(ms) ? 0 : ms; }
  return ts > 1e10 ? ts : ts * 1000;
}

function timeAgo(ts?: number | string): string {
  const ms = tsToMs(ts);
  if (!ms) return "—";
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    responded: "bg-emerald-50 text-emerald-700 border-emerald-200",
    closed: "bg-surface-container text-on-surface-variant border-outline-variant/30",
    empty: "bg-blue-50 text-blue-600 border-blue-200",
  };
  const labels: Record<string, string> = {
    pending: "Pending", responded: "Responded", closed: "Closed", empty: "No msgs",
  };
  return (
    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-label", map[status] ?? map.closed)}>
      {labels[status] ?? status}
    </span>
  );
}

// ─── Group list drawer ──────────────────────────────────────────────────────

type DrawerMode = "pending" | "followup";

function WaGroupRow({ chat }: { chat: WaChat }) {
  return (
    <Link
      to="/periskope"
      className="flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-surface-container transition-colors border border-outline-variant/20 bg-surface-container-lowest group"
    >
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-xs font-bold text-on-primary flex-shrink-0 font-headline">
        {(chat.chat_name || "G").charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium text-on-surface truncate font-headline">{chat.chat_name}</p>
          {statusBadge(chat.status)}
        </div>
        <p className="text-xs text-on-surface-variant truncate font-label">
          {chat.latest_message?.body?.substring(0, 70) ?? "No preview"}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {chat.message_unread_count > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-error text-on-error font-label min-w-[18px] text-center">
            {chat.message_unread_count}
          </span>
        )}
        <span className="text-[11px] text-on-surface-variant font-label">{timeAgo(chat.latest_message?.timestamp)}</span>
        <ExternalLink size={11} className="text-on-surface-variant opacity-0 group-hover:opacity-60 transition-opacity" />
      </div>
    </Link>
  );
}

function WaGroupDrawer({
  mode,
  pending,
  followUp,
  onClose,
}: {
  mode: DrawerMode;
  pending: WaChat[];
  followUp: WaChat[];
  onClose: () => void;
}) {
  const isPending = mode === "pending";
  const groups = isPending ? pending : followUp;
  const title = isPending ? "Pending Reply" : "Follow-Up";
  const description = isPending
    ? "Groups waiting for your response"
    : "Groups you replied to — waiting on customer";
  const Icon = isPending ? MessageCircle : Clock;
  const iconColor = isPending ? "text-amber-600" : "text-blue-600";
  const iconBg = isPending ? "bg-amber-50" : "bg-blue-50";

  const sorted = [...groups].sort(
    (a, b) => tsToMs(b.latest_message?.timestamp) - tsToMs(a.latest_message?.timestamp)
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end pointer-events-none">
      <div className="absolute inset-0 bg-black/30 pointer-events-auto" onClick={onClose} />
      <div className="relative w-[420px] h-full bg-surface-container-lowest shadow-2xl flex flex-col pointer-events-auto animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", iconBg)}>
              <Icon size={15} className={iconColor} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-on-surface font-headline">{title}</h2>
              <p className="text-[11px] text-on-surface-variant font-label">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/periskope"
              className="text-xs text-primary hover:underline font-label flex items-center gap-1"
              onClick={onClose}
            >
              Open WhatsApp <ExternalLink size={11} />
            </Link>
            <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-surface-container transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-on-surface font-label uppercase tracking-wide">
              {isPending ? "Waiting for reply" : "Replied — awaiting update"}
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-label min-w-[18px] text-center">
              {sorted.length}
            </span>
          </div>

          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant gap-2">
              <MessageCircle size={28} className="opacity-20" />
              <p className="text-sm">
                {isPending ? "No pending groups — you're all caught up!" : "No follow-up groups right now"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map((chat) => <WaGroupRow key={chat.chat_id} chat={chat} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AI digest panel ────────────────────────────────────────────────────────

function DigestPanel({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ digest: string | null; total_assigned: number; pending_count: number; mention_count: number; groups_analyzed: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const userPhone = localStorage.getItem("ke_user_phone") || "";
    fetch("/api/periskope/digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_phone: userPhone }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError("Failed to load digest"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/10">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-primary font-label">
          <Sparkles size={13} /> AI Digest — Your WhatsApp Groups
        </span>
        <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface text-xs underline">Close</button>
      </div>
      <div className="px-4 py-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant py-3">
            <RefreshCw size={12} className="animate-spin text-primary" />
            Analyzing your assigned groups with Claude…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-xs text-error py-2">
            <AlertCircle size={13} /> {error}
          </div>
        ) : !data?.digest ? (
          <p className="text-xs text-on-surface-variant py-2">No pending messages — you&apos;re all caught up!</p>
        ) : (
          <>
            <p className="text-[10px] text-on-surface-variant mb-2 font-label">
              {data.total_assigned} assigned · {data.mention_count > 0 ? `${data.mention_count} @mention${data.mention_count > 1 ? "s" : ""} · ` : ""}analyzed {data.groups_analyzed} group{data.groups_analyzed !== 1 ? "s" : ""}
            </p>
            <div className="text-xs text-on-surface leading-relaxed whitespace-pre-wrap font-label">{data.digest}</div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main section ───────────────────────────────────────────────────────────

export function WhatsAppSection() {
  const [chats, setChats] = useState<WaChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAssigned, setIsAssigned] = useState(true);
  const [showDigest, setShowDigest] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode | null>(null);

  useEffect(() => {
    // Try assigned groups first; if none assigned, fall back to all groups
    fetch("/api/periskope/chats?filter_mine=true")
      .then((r) => r.json())
      .then((d) => {
        const mine: WaChat[] = d.chats || [];
        if (mine.length > 0) {
          setChats(mine);
          setIsAssigned(true);
          setLoading(false);
        } else {
          setIsAssigned(false);
          return fetch("/api/periskope/chats")
            .then((r) => r.json())
            .then((d2) => { setChats(d2.chats || []); setLoading(false); });
        }
      })
      .catch(() => { setChats([]); setLoading(false); });
  }, []);

  const pending = chats.filter((c) => c.status === "pending");
  const followUp = chats.filter((c) => c.status === "responded" || c.status === "closed");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageCircle size={15} className="text-on-surface-variant" />
          <h2 className="text-sm font-bold font-headline text-on-surface">WhatsApp Groups</h2>
          {!loading && (
            <span className="text-[10px] font-label text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
              {isAssigned ? `${chats.length} assigned` : `${chats.length} total (none assigned to you)`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDigest((p) => !p)}
            disabled={loading || chats.length === 0}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium font-label transition-colors",
              showDigest
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-surface-container border-outline-variant/40 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high disabled:opacity-40"
            )}
          >
            <Sparkles size={12} />
            {showDigest ? "Hide AI digest" : "AI digest"}
          </button>
          <Link to="/periskope" className="flex items-center gap-1 text-xs text-primary hover:underline font-label">
            View all <ExternalLink size={11} />
          </Link>
        </div>
      </div>

      {/* Headline cards */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => setDrawerMode("pending")}
          className="bg-surface-container-lowest rounded-xl p-4 shadow-card text-left hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-label font-medium text-on-surface-variant uppercase tracking-wide">Pending Reply</p>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50">
              <MessageCircle size={14} className="text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-bold font-headline text-on-surface">{loading ? "—" : pending.length}</p>
          <p className="text-xs text-on-surface-variant mt-1">Groups waiting for your reply</p>
        </button>

        <button
          onClick={() => setDrawerMode("followup")}
          className="bg-surface-container-lowest rounded-xl p-4 shadow-card text-left hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-label font-medium text-on-surface-variant uppercase tracking-wide">Follow-Up</p>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-50">
              <Clock size={14} className="text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold font-headline text-on-surface">{loading ? "—" : followUp.length}</p>
          <p className="text-xs text-on-surface-variant mt-1">Groups you replied — awaiting update</p>
        </button>
      </div>

      {/* AI Digest panel */}
      {showDigest && <DigestPanel onClose={() => setShowDigest(false)} />}

      {/* Group list drawer */}
      {drawerMode && (
        <WaGroupDrawer
          mode={drawerMode}
          pending={pending}
          followUp={followUp}
          onClose={() => setDrawerMode(null)}
        />
      )}
    </div>
  );
}
