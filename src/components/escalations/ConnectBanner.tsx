"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Mail, CheckCircle, ExternalLink, Ticket, X, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConnectBannerProps {
  slackConnected: boolean;
  gmailConnected?: boolean;
  jiraConnected?: boolean;
  onJiraConnected?: () => void;
}

export function ConnectBanner({ slackConnected, gmailConnected = false, jiraConnected: jiraConnectedProp = false, onJiraConnected }: ConnectBannerProps) {
  const [jiraConnected, setJiraConnected] = useState(jiraConnectedProp);
  const [showJiraForm, setShowJiraForm] = useState(false);
  const [jiraToken, setJiraToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [jiraSaving, setJiraSaving] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [jiraSuccess, setJiraSuccess] = useState<string | null>(null);

  useEffect(() => {
    setJiraConnected(jiraConnectedProp);
  }, [jiraConnectedProp]);

  async function saveJiraToken() {
    if (!jiraToken.trim()) return;
    setJiraSaving(true);
    setJiraError(null);
    try {
      const res = await fetch("/api/jira/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiToken: jiraToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJiraError(data.error || "Failed to save token");
      } else {
        setJiraConnected(true);
        setShowJiraForm(false);
        setJiraToken("");
        setJiraSuccess(`Connected as ${data.displayName ?? "your account"}`);
        onJiraConnected?.();
        setTimeout(() => setJiraSuccess(null), 4000);
      }
    } catch {
      setJiraError("Network error — please try again");
    } finally {
      setJiraSaving(false);
    }
  }

  async function disconnectJira() {
    await fetch("/api/jira/connect", { method: "DELETE" });
    setJiraConnected(false);
    setShowJiraForm(false);
  }

  return (
    <div className="px-5 py-3.5 bg-primary-fixed rounded-xl space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Slack status */}
        <div className={cn("flex items-center gap-2 text-sm", slackConnected ? "text-green-700" : "text-on-primary-fixed-variant")}>
          {slackConnected ? <CheckCircle size={15} /> : <MessageSquare size={15} />}
          <span>{slackConnected ? "Slack connected" : "Connect Slack for DMs & mentions"}</span>
          {slackConnected && (
            <a href="/api/slack/connect" className="text-xs underline opacity-50 hover:opacity-100 transition-opacity ml-1">Reconnect</a>
          )}
        </div>

        {/* Gmail status */}
        <div className={cn("flex items-center gap-2 text-sm", gmailConnected ? "text-green-700" : "text-on-primary-fixed-variant")}>
          {gmailConnected ? <CheckCircle size={15} /> : <Mail size={15} />}
          <span>{gmailConnected ? "Gmail connected" : "Connect Gmail for email threads"}</span>
          {gmailConnected && (
            <a href="/api/gmail/connect" className="text-xs underline opacity-50 hover:opacity-100 transition-opacity ml-1">Reconnect</a>
          )}
        </div>

        {/* Jira status */}
        <div className={cn("flex items-center gap-2 text-sm", jiraConnected ? "text-green-700" : "text-on-primary-fixed-variant")}>
          {jiraConnected ? <CheckCircle size={15} /> : <Ticket size={15} />}
          <span>{jiraConnected ? "Jira connected" : "Connect Jira to see your tickets"}</span>
          {jiraConnected ? (
            <button onClick={disconnectJira} className="text-xs underline opacity-50 hover:opacity-100 transition-opacity ml-1">Disconnect</button>
          ) : (
            <button onClick={() => setShowJiraForm((v) => !v)} className="text-xs underline opacity-70 hover:opacity-100 transition-opacity ml-1">
              {showJiraForm ? "Cancel" : "Set up"}
            </button>
          )}
        </div>

        {/* Action buttons for Slack/Gmail */}
        <div className="flex items-center gap-2 ml-auto">
          {!slackConnected && (
            <a href="/api/slack/connect" className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition-opacity">
              <MessageSquare size={13} />Connect Slack<ExternalLink size={11} />
            </a>
          )}
          {!gmailConnected && (
            <a href="/api/gmail/connect" className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-outline-variant text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors">
              <Mail size={13} />Connect Gmail<ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>

      {/* Jira token form */}
      {showJiraForm && !jiraConnected && (
        <div className="bg-white/60 rounded-xl px-4 py-3 space-y-2">
          <p className="text-xs text-on-surface-variant">
            Enter your personal Atlassian API token. Your app login email must match your Jira account email.{" "}
            <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" className="underline text-primary">
              Get a token →
            </a>
          </p>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type={showToken ? "text" : "password"}
                value={jiraToken}
                onChange={(e) => setJiraToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveJiraToken()}
                placeholder="Paste your Atlassian API token"
                className="w-full text-xs px-3 py-2 rounded-lg border border-outline-variant/40 bg-white text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary pr-8"
                autoFocus
              />
              <button onClick={() => setShowToken((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant">
                {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <button
              onClick={saveJiraToken}
              disabled={!jiraToken.trim() || jiraSaving}
              className="text-xs px-3 py-2 rounded-lg bg-primary text-on-primary font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {jiraSaving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setShowJiraForm(false)} className="text-on-surface-variant hover:text-on-surface">
              <X size={15} />
            </button>
          </div>
          {jiraError && <p className="text-xs text-error">{jiraError}</p>}
        </div>
      )}

      {jiraSuccess && (
        <p className="text-xs text-green-700 font-medium">{jiraSuccess}</p>
      )}
    </div>
  );
}
