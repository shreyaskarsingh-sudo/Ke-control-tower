import { MessageSquare, Mail, CheckCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api";

interface ConnectBannerProps {
  slackConnected: boolean;
  gmailConnected?: boolean;
}

export function ConnectBanner({ slackConnected, gmailConnected = false }: ConnectBannerProps) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 bg-primary-fixed rounded-xl">
      <div className="flex items-center gap-4 flex-1 flex-wrap">
        {/* Slack status */}
        <div className={cn("flex items-center gap-2 text-sm", slackConnected ? "text-green-700" : "text-on-primary-fixed-variant")}>
          {slackConnected ? <CheckCircle size={15} /> : <MessageSquare size={15} />}
          <span>{slackConnected ? "Slack connected" : "Connect Slack for DMs & mentions"}</span>
          {slackConnected && (
            <a href={apiUrl("/api/slack/connect")} className="text-xs underline opacity-50 hover:opacity-100 transition-opacity ml-1">
              Reconnect
            </a>
          )}
        </div>
        {/* Gmail status */}
        <div className={cn("flex items-center gap-2 text-sm", gmailConnected ? "text-green-700" : "text-on-primary-fixed-variant")}>
          {gmailConnected ? <CheckCircle size={15} /> : <Mail size={15} />}
          <span>{gmailConnected ? "Gmail connected" : "Connect Gmail for email threads"}</span>
          {gmailConnected && (
            <a href={apiUrl("/api/gmail/connect")} className="text-xs underline opacity-50 hover:opacity-100 transition-opacity ml-1">
              Reconnect
            </a>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!slackConnected && (
          <a
            href={apiUrl("/api/slack/connect")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container transition-colors"
          >
            <MessageSquare size={13} />
            Connect Slack
            <ExternalLink size={11} />
          </a>
        )}
        {!gmailConnected && (
          <a
            href={apiUrl("/api/gmail/connect")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-outline-variant text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <Mail size={13} />
            Connect Gmail
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  );
}
