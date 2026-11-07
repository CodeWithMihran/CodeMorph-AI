const SECRET_VALUE_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)|\b(?:sk-[A-Za-z0-9_-]{20,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{30,}|xox[baprs]-[A-Za-z0-9-]{20,})\b|\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,}|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gi;
const SECRET_ASSIGNMENT_PATTERN = /(["']?(?:[A-Za-z_$][A-Za-z0-9_$.-]{0,100})?(?:api[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|password|secret|token|private[_-]?key|key)[A-Za-z0-9_$.-]{0,40}["']?\s*[:=]\s*["'])([^"'\r\n]{8,})(["'])/gi;

export function containsSecret(input: string) {
  SECRET_VALUE_PATTERN.lastIndex = 0;
  SECRET_ASSIGNMENT_PATTERN.lastIndex = 0;
  return SECRET_VALUE_PATTERN.test(input) || SECRET_ASSIGNMENT_PATTERN.test(input);
}

export function redactSecretText(input: string) {
  return input
    .replace(SECRET_VALUE_PATTERN, "[REDACTED SECRET]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "$1[REDACTED]$3");
}
