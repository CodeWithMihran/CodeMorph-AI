import { redactSecretText } from "@/lib/security/secrets";

export function redactAuditEvidence(line: string) {
  return redactSecretText(line).trim().slice(0, 240);
}
