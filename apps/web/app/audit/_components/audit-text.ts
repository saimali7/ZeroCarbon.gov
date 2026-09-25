/**
 * Display clean-up for audit event text written by the API
 * ("non compliant", "8 finding(s)", "in 0.0 s", lowercase system actors).
 */
export function auditMessage(message: string): string {
  return message
    .replace(/\bnon compliant\b/g, "non-compliant")
    .replace(/\b(\d+) (finding|file|document)\(s\)/g, (_, n: string, noun: string) => `${n} ${noun}${n === "1" ? "" : "s"}`)
    .replace(/\bin 0\.0 s\b/, "in under 0.1 s")
    .replace(/ \(template\)$/, " (standard wording)")
    .replace(/^Approve letter\b/, "Acceptance letter");
}

export function auditActor(actor: string): string {
  return /^[a-z]/.test(actor) ? actor.charAt(0).toUpperCase() + actor.slice(1) : actor;
}
