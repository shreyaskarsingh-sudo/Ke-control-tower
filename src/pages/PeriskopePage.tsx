import { apiFetch } from '@/lib/api'
import { useState, useEffect, useCallback, useRef } from "react";
import { MessageCircle, Users, Bell, RefreshCw, Phone, X, ChevronDown, ChevronUp, Sparkles, AlertCircle, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WaChat {
  chat_id: string;
  chat_name: string;
  status: string;
  message_unread_count: number;
  user_mentioned?: boolean;
  assigned_to?: string | null;
  latest_message?: { body?: string; timestamp?: number | string; fromMe?: boolean; mentioned_ids?: string[] };
  chat_access?: Record<string, boolean>;
}

interface WaMessage {
  id: string;
  body?: string;
  timestamp?: number | string;
  fromMe?: boolean;
  sender_name?: string;
  mentioned_ids?: string[];
}

function tsToMs(ts?: number | string): number {
  if (!ts) return 0;
  if (typeof ts === "string") {
    const ms = new Date(ts).getTime();
    return isNaN(ms) ? 0 : ms;
  }
  return ts > 1e10 ? ts : ts * 1000;
}

function timeAgo(ts?: number | string | Date): string {
  const ms = ts instanceof Date ? ts.getTime() : tsToMs(ts);
  if (!ms) return "—";
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    responded: "bg-emerald-50 text-emerald-700 border-emerald-200",
    closed: "bg-surface-container text-on-surface-variant border-outline-variant/40",
    empty: "bg-blue-50 text-blue-600 border-blue-200",
  };
  const labels: Record<string, string> = {
    pending: "Pending", responded: "Responded", closed: "Closed", empty: "No msgs",
  };
  return (
    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-label", styles[status] ?? styles.closed)}>
      {labels[status] ?? status}
    </span>
  );
}

function AnalysisPanel({ chatId, chatName, onClose }: { chatId: string; chatName: string; onClose: () => void }) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    apiFetch("/api/periskope/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, chatName }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setAnalysis(d.analysis || "No analysis available.");
      })
      .catch(() => setError("Failed to fetch analysis"))
      .finally(() => setLoading(false));
  }, [chatId, chatName]);

  return (
    <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/10">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-primary font-label">
          <Sparkles size={13} />
          AI Analysis
        </span>
        <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
          <X size={13} />
        </button>
      </div>
      <div className="px-4 py-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant py-2">
            <RefreshCw size={12} className="animate-spin text-primary" />
            Analyzing last 30 days of messages…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-xs text-error">
            <AlertCircle size={13} />
            {error}
          </div>
        ) : (
          <div className="text-xs text-on-surface leading-relaxed whitespace-pre-wrap font-label space-y-1">
            {analysis}
          </div>
        )}
      </div>
    </div>
  );
}

function KeAnalysisPanel({ chatName, onClose }: { chatName: string; onClose: () => void }) {
  const [merchantId, setMerchantId] = useState("");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    if (!merchantId.trim()) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await apiFetch("/api/ke/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId: merchantId.trim(), chatName }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setAnalysis(data.analysis || "No analysis available.");
    } catch {
      setError("Failed to connect to KE MCP.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-200/60">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 font-label">
          <Building2 size={13} />
          KE Analysis
        </span>
        <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
          <X size={13} />
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {!analysis && (
          <>
            <p className="text-xs text-on-surface-variant font-label">
              Enter the GoKwik Merchant ID to fetch their active KE products, campaigns and automations.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runAnalysis()}
                placeholder="e.g. 19g6ila23ecj7"
                autoFocus
                className="flex-1 text-xs px-3 py-2 rounded-lg border border-amber-200 bg-white text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-amber-400 font-label"
              />
              <button
                onClick={runAnalysis}
                disabled={!merchantId.trim() || loading}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-amber-600 text-white font-medium font-label hover:bg-amber-700 disabled:opacity-40 transition-colors"
              >
                {loading ? <RefreshCw size={12} className="animate-spin" /> : <Building2 size={12} />}
                {loading ? "Fetching…" : "Analyze"}
              </button>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-xs text-error">
                <AlertCircle size={12} className="flex-shrink-0" />
                {error}
              </div>
            )}
          </>
        )}

        {analysis && (
          <div className="space-y-3">
            <div className="text-xs text-on-surface leading-relaxed whitespace-pre-wrap font-label">
              {analysis}
            </div>
            <button
              onClick={() => { setAnalysis(null); setMerchantId(""); setError(null); }}
              className="text-[11px] text-amber-600 hover:text-amber-700 font-label underline underline-offset-2"
            >
              Look up another merchant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatThread({ chatId }: { chatId: string }) {
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    apiFetch(`/api/periskope/chats/${encodeURIComponent(chatId)}/messages`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [chatId]);

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-6 text-on-surface-variant text-xs">
      <RefreshCw size={13} className="animate-spin" /> Loading messages…
    </div>
  );
  if (!messages.length) return (
    <p className="text-xs text-on-surface-variant py-6 text-center">No messages in the last 30 days</p>
  );

  return (
    <div className="space-y-2 mt-3 max-h-64 overflow-y-auto custom-scrollbar pr-1">
      {messages.slice().reverse().map((m, i) => {
        const senderLabel = m.fromMe ? "You (KwikEngage)" : (m.sender_name || "Member");
        return (
          <div key={i} className={cn("flex", m.fromMe ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[80%] rounded-xl px-3 py-2 text-xs",
              m.fromMe
                ? "bg-primary/10 border border-primary/20 text-on-surface"
                : "bg-surface-container text-on-surface"
            )}>
              <p className={cn(
                "text-[10px] font-semibold mb-0.5",
                m.fromMe ? "text-primary/70 text-right" : "text-primary"
              )}>
                {senderLabel}
              </p>
              <p className="leading-relaxed whitespace-pre-wrap break-words">{m.body || "—"}</p>
              <p className="text-[10px] text-on-surface-variant mt-1 text-right">{timeAgo(m.timestamp)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getInitials(name: string): string {
  const words = (name || "GR").trim().split(/\s+/);
  return words.slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "GR";
}

function ChatCard({ chat }: { chat: WaChat }) {
  const [expanded, setExpanded] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showKeAnalysis, setShowKeAnalysis] = useState(false);
  const initials = getInitials(chat.chat_name);
  const preview = chat.latest_message?.body?.substring(0, 90) ?? "No messages";

  return (
    <div className={cn(
      "bg-surface-container-lowest rounded-xl shadow-card overflow-hidden transition-shadow hover:shadow-md",
      chat.status === "pending" && "border border-amber-200",
      chat.user_mentioned && "border border-violet-200",
      !chat.user_mentioned && chat.status !== "pending" && "border border-outline-variant/20"
    )}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-container/40 transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-xs font-bold text-on-primary flex-shrink-0 font-headline">
          {initials}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-on-surface font-headline truncate">{chat.chat_name || "—"}</span>
            {chat.user_mentioned && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-violet-300 bg-violet-50 text-violet-700 font-label">@YOU</span>
            )}
            {chat.message_unread_count > 0 && (
              <span className="text-[10px] font-bold px-1.5 min-w-[18px] text-center py-0.5 rounded-full bg-error text-on-error font-label">
                {chat.message_unread_count}
              </span>
            )}
          </div>
          <p className="text-xs text-on-surface-variant truncate mt-0.5 font-label">{preview}</p>
          {chat.assigned_to && (
            <p className="text-[10px] text-on-surface-variant/60 mt-0.5 font-label truncate">
              Assigned: {chat.assigned_to.split("@")[0]}
            </p>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={chat.status} />
          <span className="text-xs text-on-surface-variant font-label">{timeAgo(chat.latest_message?.timestamp)}</span>
          {expanded
            ? <ChevronUp size={14} className="text-on-surface-variant" />
            : <ChevronDown size={14} className="text-on-surface-variant" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-outline-variant/20">
          {/* Actions row */}
          <div className="flex items-center justify-end gap-2 pt-2.5 pb-1">
            <button
              onClick={() => { setShowKeAnalysis((p) => !p); setShowAnalysis(false); }}
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium font-label transition-colors",
                showKeAnalysis
                  ? "bg-amber-100 border-amber-300 text-amber-700"
                  : "bg-surface-container border-outline-variant/40 text-on-surface-variant hover:text-on-surface hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700"
              )}
            >
              <Building2 size={12} />
              {showKeAnalysis ? "Hide KE" : "KE Analysis"}
            </button>
            <button
              onClick={() => { setShowAnalysis((p) => !p); setShowKeAnalysis(false); }}
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium font-label transition-colors",
                showAnalysis
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-surface-container border-outline-variant/40 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
              )}
            >
              <Sparkles size={12} />
              {showAnalysis ? "Hide analysis" : "Analyze with AI"}
            </button>
          </div>

          {showKeAnalysis && (
            <KeAnalysisPanel
              chatName={chat.chat_name}
              onClose={() => setShowKeAnalysis(false)}
            />
          )}

          {showAnalysis && (
            <AnalysisPanel
              chatId={chat.chat_id}
              chatName={chat.chat_name}
              onClose={() => setShowAnalysis(false)}
            />
          )}

          <ChatThread chatId={chat.chat_id} />
        </div>
      )}
    </div>
  );
}

export default function PeriskopePage() {
  const [tab, setTab] = useState<"all" | "mine" | "mentions">("all");
  const [allChats, setAllChats] = useState<WaChat[]>([]);
  const [myChats, setMyChats] = useState<WaChat[]>([]);
  const [mentions, setMentions] = useState<WaChat[]>([]);
  const [loading, setLoading] = useState(false);
  const [mentionsLoading, setMentionsLoading] = useState(false);
  const [phone, setPhone] = useState<string>("");
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("ke_user_phone") || "";
    setPhone(saved);
    setPhoneInput(saved);
  }, []);

  const loadChats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Load all groups + my groups in parallel (my groups filter by session email server-side)
      const [allRes, myRes] = await Promise.all([
        apiFetch("/api/periskope/chats"),
        apiFetch("/api/periskope/chats?filter_mine=true"),
      ]);
      const [allData, myData] = await Promise.all([allRes.json(), myRes.json()]);

      const all: WaChat[] = allData.chats || [];
      setAllChats(all);
      setMyChats(myData.chats || []);
      setLoadedAt(new Date());

      // Surface mentions from latest_message if phone is known
      if (phone) {
        const phoneId = phone.replace(/[^0-9]/g, "") + "@c.us";
        setMentions(all.filter((c) => {
          const ids = (c.latest_message?.mentioned_ids as string[]) || [];
          return ids.includes(phoneId);
        }));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [phone]);

  const loadMentions = useCallback(async () => {
    if (!phone) { setShowPhoneModal(true); return; }
    setMentionsLoading(true);
    try {
      const res = await apiFetch(`/api/periskope/mentions?user_phone=${phone}`);
      const data = await res.json();
      setMentions(data.mentions || []);
    } finally {
      setMentionsLoading(false);
    }
  }, [phone]);

  useEffect(() => { loadChats(); }, [loadChats]);
  useEffect(() => {
    const id = setInterval(() => loadChats(true), 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [loadChats]);

  function savePhone() {
    const val = phoneInput.replace(/[^0-9]/g, "");
    if (!val || val.length < 10) return;
    localStorage.setItem("ke_user_phone", val);
    setPhone(val);
    setShowPhoneModal(false);
    loadChats();
  }

  const filtered = (tab === "all" ? allChats : tab === "mine" ? myChats : mentions)
    .filter((c) => !search || c.chat_name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (b.status === "pending" && a.status !== "pending") return 1;
      return tsToMs(b.latest_message?.timestamp) - tsToMs(a.latest_message?.timestamp);
    });

  const pendingAll = allChats.filter((c) => c.status === "pending").length;
  const pendingMine = myChats.filter((c) => c.status === "pending").length;
  const mentionCount = mentions.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-8 py-5 border-b border-outline-variant/20 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-on-surface font-headline flex items-center gap-2">
            <MessageCircle size={18} className="text-primary" />
            WhatsApp Groups
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5 font-label">
            {loadedAt
              ? `${allChats.length} groups · updated ${timeAgo(loadedAt)}`
              : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPhoneModal(true)}
            className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-on-surface border border-outline-variant/40 rounded-lg px-3 py-1.5 transition-colors bg-surface-container-lowest"
          >
            <Phone size={13} />
            {phone ? `+${phone.slice(0, 2)} ${phone.slice(2, 7)}•••` : "Set phone for mentions"}
          </button>
          <button
            onClick={() => loadChats()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs bg-primary text-on-primary rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 hover:opacity-90"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex items-center gap-1 px-8 pt-3 border-b border-outline-variant/20">
        {[
          { id: "all", icon: MessageCircle, label: "All Groups", count: pendingAll },
          { id: "mine", icon: Users, label: "My Groups", count: pendingMine },
          { id: "mentions", icon: Bell, label: "Mentions", count: mentionCount },
        ].map(({ id, icon: Icon, label, count }) => (
          <button
            key={id}
            onClick={() => {
              setTab(id as typeof tab);
              if (id === "mentions" && !mentions.length) loadMentions();
            }}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium font-label border-b-2 -mb-px transition-colors",
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            )}
          >
            <Icon size={14} />
            {label}
            {count > 0 && (
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center font-label",
                tab === id ? "bg-primary/15 text-primary" : "bg-surface-container text-on-surface-variant"
              )}>
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex-shrink-0 px-8 py-3">
        <input
          type="text"
          placeholder="Search groups…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-surface-container rounded-xl px-4 py-2 text-sm text-on-surface placeholder-on-surface-variant/50 outline-none focus:bg-surface-container-high transition-colors"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-8 pb-8">
        {(loading && tab !== "mentions") || (mentionsLoading && tab === "mentions") ? (
          <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant gap-3">
            <RefreshCw size={22} className="animate-spin text-primary" />
            <p className="text-sm">{tab === "mentions" ? "Scanning for mentions…" : "Loading groups…"}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant gap-3">
            <MessageCircle size={28} className="opacity-30" />
            <p className="text-sm">
              {tab === "mine"
                ? "No groups assigned to you"
                : tab === "mentions" && !phone
                ? "Set your phone number to detect @mentions"
                : tab === "mentions"
                ? "No @mentions found in recent messages"
                : "No groups found"}
            </p>
            {tab === "mentions" && !phone && (
              <button onClick={() => setShowPhoneModal(true)} className="text-xs text-primary underline">
                Set phone →
              </button>
            )}
            {tab === "mentions" && phone && (
              <button onClick={loadMentions} className="text-xs text-primary underline flex items-center gap-1">
                <RefreshCw size={11} /> Deep scan unread messages
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((chat) => <ChatCard key={chat.chat_id} chat={chat} />)}
          </div>
        )}
      </div>

      {/* Phone Modal */}
      {showPhoneModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-on-surface font-headline flex items-center gap-2">
                <Phone size={16} className="text-primary" />
                Set Your WhatsApp Number
              </h3>
              <button onClick={() => setShowPhoneModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-on-surface-variant mb-4 leading-relaxed">
              Your phone number registered in KwikEngage. Used to detect @mentions in group chats. Stored locally only.
            </p>
            <input
              type="tel"
              placeholder="91XXXXXXXXXX"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && savePhone()}
              className="w-full bg-surface-container rounded-xl px-3 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/50 outline-none focus:bg-surface-container-high mb-4 transition-colors font-mono tracking-widest"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowPhoneModal(false)} className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
                Skip
              </button>
              <button onClick={savePhone} className="px-4 py-2 text-sm bg-primary text-on-primary rounded-xl transition-colors font-medium hover:opacity-90">
                Save & Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
