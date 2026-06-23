export type EscalationSource = "gmail" | "slack" | "jira";
export type EscalationStatus = "open" | "pending_reply" | "closed" | "sla_breached";
export type EscalationPriority = "critical" | "high" | "medium" | "low";

export interface SlackMessage {
  text: string;
  fromMe: boolean;
  sender: string;
  ts: string;
}

export interface JiraComment {
  author: string;
  authorEmail: string;
  body: string;
  created: string;
}

export interface Escalation {
  id: string;
  source: EscalationSource;
  subject: string;
  merchantName: string;
  merchantId?: string;
  status: EscalationStatus;
  priority: EscalationPriority;
  assignee?: string;
  assigneeEmail?: string;
  reporterName?: string;
  reporterEmail?: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  threadId?: string;
  channelId?: string;
  threadTs?: string;
  jiraKey?: string;
  jiraUrl?: string;
  description?: string;
  comments?: JiraComment[];
  messageCount: number;
  snippet: string;
  waitingSince?: string;
  category?: string;
  tags?: string[];
  isRead: boolean;
  daysOpen?: number;
  daysSinceUpdate?: number;
  jiraPriority?: string;
  jiraStatus?: string;
  waitingOnCSM?: boolean;
  isReported?: boolean;
  isTeamItem?: boolean;
  slackType?: "dm" | "mention" | "raised";
  slackUrl?: string;
  threadMessages?: string[];
  slackMessages?: SlackMessage[];
  originalMessage?: string;
  labels?: string[];
  lastCommentByCSM?: boolean;
}

export interface Thread {
  id: string;
  escalationId: string;
  messages: Message[];
}

export interface Message {
  id: string;
  from: string;
  fromEmail: string;
  to?: string;
  body: string;
  timestamp: string;
  isInternal?: boolean;
}

export interface MerchantStats {
  merchantId: string;
  merchantName: string;
  totalEscalations: number;
  openEscalations: number;
  avgResolutionHours: number;
  slaBreaches: number;
  healthScore: number;
  trend: "improving" | "stable" | "degrading";
  categories: Record<string, number>;
}

export interface DashboardStats {
  totalOpen: number;
  pendingReply: number;
  closedToday: number;
  slaBreached: number;
  avgResponseTimeHours: number;
  totalThisWeek: number;
}

export interface AIReplyRequest {
  threadContext: Message[];
  merchantName: string;
  source: EscalationSource;
  tone: "formal" | "empathetic" | "technical";
  instruction?: string;
}
