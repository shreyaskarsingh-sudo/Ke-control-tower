import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { differenceInDays } from "date-fns";

const BASE = process.env.JIRA_BASE_URL;
const EMAIL = process.env.JIRA_EMAIL;
const TOKEN = process.env.JIRA_API_TOKEN;

function auth() {
  return "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
}

async function jiraFetch(path: string) {
  const res = await fetch(`${BASE}/rest/api/3${path}`, {
    headers: { Authorization: auth(), Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Jira ${res.status}: ${path}`);
  return res.json();
}

// Fetch ALL pages using cursor-based pagination (/search/jql returns nextPageToken)
async function jiraFetchAll(jql: string, fields: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let nextPageToken = "";
  let isLast = false;

  do {
    const tokenParam = nextPageToken ? `&nextPageToken=${encodeURIComponent(nextPageToken)}` : "";
    const path = `/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=${fields}${tokenParam}`;
    const data = await jiraFetch(path);
    all.push(...((data.issues ?? []) as Record<string, unknown>[]));
    isLast = data.isLast ?? true;
    nextPageToken = (data.nextPageToken as string) ?? "";
  } while (!isLast && nextPageToken);

  return all;
}

// Convert Atlassian Document Format (ADF) to plain text
function adfToText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (n.type === "text") return (n.text as string) || "";
  if (n.type === "hardBreak" || n.type === "rule") return "\n";
  if (n.type === "mention") return `@${(n.attrs as Record<string, string>)?.text ?? ""}`;
  const children = (n.content as unknown[]) ?? [];
  let text = children.map(adfToText).join("");
  if (["paragraph", "heading", "blockquote"].includes(n.type as string)) text += "\n";
  if (n.type === "listItem") text = "• " + text;
  return text;
}

// Words that indicate a segment is a category/issue type, not a merchant name
const CATEGORY_WORDS = new Set([
  "adonc", "case", "cases", "increase", "increased", "error", "failure", "issue",
  "priority", "custom", "checkout", "payment", "refund", "manual", "warning",
  "critical", "infra", "post", "order", "orders", "request", "reg", "on", "for",
  "failed", "failing", "not", "incorrect", "auto", "spike", "spiked", "latency",
]);

function looksLikeMerchant(segment: string): boolean {
  const s = segment.trim();
  if (!s || s.length < 2 || s.length > 45) return false;
  if (/^\d/.test(s)) return false;
  if (/^\[/.test(s)) return false;
  const words = s.toLowerCase().split(/\s+/);
  const hasCategoryWord = words.some((w) => CATEGORY_WORDS.has(w));
  if (hasCategoryWord && words.length <= 4) return false;
  return true;
}

function extractMerchant(summary: string, labels: string[]): string {
  const arrowMatch = summary.match(/^(.+?)\s*<>/);
  if (arrowMatch) {
    const c = arrowMatch[1].trim();
    if (looksLikeMerchant(c)) return c;
  }

  if (summary.includes("|")) {
    const parts = summary.split("|").map((p) => p.trim());
    const first = parts[0];
    if (looksLikeMerchant(first) && first.split(" ").length <= 3 && first.length < 25) return first;
    const candidates = parts.filter(looksLikeMerchant);
    if (candidates.length > 0) return candidates[candidates.length - 1];
  }

  const startDash = summary.match(/^([A-Za-z][a-zA-Z0-9\s.&']{1,28}?)\s+-\s+\S/);
  if (startDash && looksLikeMerchant(startDash[1])) return startDash[1].trim();

  const endDash = summary.match(/\s+-\s+([A-Za-z][a-zA-Z0-9\s.&']{1,28}?)\s*$/);
  if (endDash && looksLikeMerchant(endDash[1])) return endDash[1].trim();

  if (labels.length > 0) return labels[0];
  return "Unknown Merchant";
}

const FIELDS = "summary,status,priority,assignee,reporter,updated,created,comment,labels,description,watches";

function mapJiraStatus(jiraStatus: string): "open" | "pending_reply" | "closed" | "sla_breached" {
  const s = jiraStatus.toLowerCase();
  if (s === "done" || s === "closed" || s === "resolved" || s === "won't fix") return "closed";
  if (s.includes("sla") || s.includes("breach")) return "sla_breached";
  if (s.includes("wait") || s.includes("pending") || s === "new" || s.includes("hold")) return "pending_reply";
  return "open";
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") ?? "my-queue";
  const email = session.email;

  // my-queue: assigned OR reported by this CSM (paginate all)
  // team: tickets where CSM commented but is not assignee/reporter,
  //       OR tickets where CSM is a watcher (catches @mentions and watched issues)
  const jql =
    view === "team"
      ? `(issuekey in issuesWhereUserCommented() OR watcher = "${email}") AND assignee != "${email}" AND reporter != "${email}" AND statusCategory != Done ORDER BY updated DESC`
      : `(assignee = "${email}" OR reporter = "${email}") AND statusCategory != Done ORDER BY updated ASC`;

  try {
    const rawIssues = await jiraFetchAll(jql, FIELDS);

    type RawIssue = { key: string; fields: Record<string, unknown> };
    const issues = (rawIssues as RawIssue[]).map((issue) => {
      const fields = issue.fields;

      const reporter = fields.reporter as { emailAddress?: string; displayName?: string } | null;
      const assignee = fields.assignee as { emailAddress?: string; displayName?: string } | null;
      const reporterEmail = reporter?.emailAddress ?? "";
      const assigneeEmail = assignee?.emailAddress ?? "";
      const isReported = reporterEmail === email && assigneeEmail !== email;
      const isTeamItem = view === "team";

      const updatedAt = fields.updated as string;
      const createdAt = fields.created as string;
      const daysSinceUpdate = differenceInDays(new Date(), new Date(updatedAt));
      const daysOpen = differenceInDays(new Date(), new Date(createdAt));
      const labels = (fields.labels as string[]) ?? [];

      type RawComment = { author: { displayName: string; emailAddress: string }; body: unknown; created: string };
      const rawComments: RawComment[] = (fields.comment as { comments: RawComment[] })?.comments ?? [];
      const comments = rawComments.map((c) => ({
        author: c.author?.displayName ?? "Unknown",
        authorEmail: c.author?.emailAddress ?? "",
        body: adfToText(c.body).trim(),
        created: c.created,
      }));

      const lastComment = comments[comments.length - 1];
      const lastCommentByCSM = rawComments[rawComments.length - 1]?.author?.emailAddress?.endsWith("@gokwik.co") ?? false;
      const waitingOnCSM = !lastCommentByCSM && rawComments.length > 0;

      // SLA breach: waiting on CSM (merchant replied) AND no GoKwik response for 2+ days
      const slaBreached = waitingOnCSM && daysSinceUpdate >= 2;

      const jiraPriority = (fields.priority as { name: string } | null)?.name?.toLowerCase() ?? "medium";
      let urgency: "critical" | "high" | "medium" | "low" = "medium";
      if (slaBreached || jiraPriority === "highest" || jiraPriority === "critical") urgency = "critical";
      else if (jiraPriority === "high" || (waitingOnCSM && daysSinceUpdate >= 1) || daysSinceUpdate >= 7) urgency = "high";
      else if (daysSinceUpdate >= 3 || waitingOnCSM) urgency = "medium";
      else urgency = "low";

      const summary = fields.summary as string;
      const description = adfToText(fields.description).trim();
      const snippet = lastComment
        ? `${lastComment.author}: ${lastComment.body.slice(0, 120)}`
        : description.slice(0, 120) || "No comments yet";

      const rawStatus = (fields.status as { name: string }).name;
      const mappedStatus = slaBreached ? "sla_breached" : mapJiraStatus(rawStatus);

      return {
        id: issue.key,
        source: "jira",
        jiraKey: issue.key,
        jiraUrl: `${BASE}/browse/${issue.key}`,
        subject: summary,
        merchantName: extractMerchant(summary, labels),
        description: description.slice(0, 3000),
        comments,
        status: mappedStatus,
        jiraStatus: rawStatus,
        priority: urgency,
        jiraPriority: (fields.priority as { name: string } | null)?.name ?? "Medium",
        assignee: assignee?.displayName ?? null,
        assigneeEmail,
        reporterName: reporter?.displayName ?? null,
        reporterEmail,
        createdAt,
        updatedAt,
        daysOpen,
        daysSinceUpdate,
        waitingOnCSM,
        lastCommentByCSM,
        messageCount: comments.length,
        labels,
        snippet,
        lastMessageAt: lastComment?.created ?? updatedAt,
        needsAction: waitingOnCSM || daysSinceUpdate >= 3,
        isRead: false,
        isReported,
        isTeamItem,
        waitingSince: createdAt,
      };
    });

    issues.sort((a: { waitingOnCSM: boolean; daysSinceUpdate: number }, b: { waitingOnCSM: boolean; daysSinceUpdate: number }) => {
      if (a.waitingOnCSM && !b.waitingOnCSM) return -1;
      if (!a.waitingOnCSM && b.waitingOnCSM) return 1;
      return b.daysSinceUpdate - a.daysSinceUpdate;
    });

    return NextResponse.json({ issues, total: issues.length });
  } catch (err) {
    console.error("Jira fetch error:", err);
    return NextResponse.json({ error: "Jira fetch failed" }, { status: 500 });
  }
}
