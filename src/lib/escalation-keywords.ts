// Configurable escalation keyword list — edit this file to add/remove keywords without a code deploy.
// Admins: add keywords to the ESCALATION_KEYWORDS array. They are matched case-insensitively.
export const ESCALATION_KEYWORDS: string[] = [
  // Core escalation intent
  "escalate",
  "escalation",
  // Legal threats
  "legal",
  "legal action",
  "trai",
  "consumer forum",
  // Service complaints
  "bad service",
  "no response",
  "poor service",
  // Social media threats
  "social media",
  "will post on instagram",
  "will post on twitter",
  "will go viral",
  // Dissatisfaction language
  "dissatisfied",
  "unhappy with your service",
  "not acceptable",
  "unacceptable",
  // Slow/delayed response complaints
  "delayed response",
  "no one is responding",
  "waiting for days",
  "nobody is responding",
  // Churn / leaving threats
  "move to another platform",
  "may churn",
  "will churn",
  "discontinue",
  // Formal escalation language
  "facts on record",
  "escalating to founders",
  "escalating to management",
  // Compensation demands
  "demand compensation",
  "will not pay unless",
];

export function isEscalation(text: string): boolean {
  const lower = text.toLowerCase();
  return ESCALATION_KEYWORDS.some((kw) => lower.includes(kw));
}

export function getMatchedKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return ESCALATION_KEYWORDS.filter((kw) => lower.includes(kw));
}
