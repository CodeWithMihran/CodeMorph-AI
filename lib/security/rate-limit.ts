import { GitHubApiError } from "@/lib/github/api";

export type RateLimitAction = "analyze" | "audit" | "plan" | "generate" | "memory_review";

export interface RateLimitPolicy {
  windowSeconds: number;
  maxRequests: number;
}

const DEFAULT_POLICIES: Record<RateLimitAction, RateLimitPolicy> = {
  analyze: { windowSeconds: 60, maxRequests: 20 },
  audit: { windowSeconds: 60, maxRequests: 8 },
  plan: { windowSeconds: 60, maxRequests: 12 },
  generate: { windowSeconds: 600, maxRequests: 4 },
  memory_review: { windowSeconds: 60, maxRequests: 40 },
};

const store = new Map<string, number[]>();
let activeGenerations = 0;
const MAX_CONCURRENT_GENERATIONS = 2;

export function getClientIp(request: Request): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0].trim();
    if (firstIp) return normalizeIp(firstIp);
  }

  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp && xRealIp.trim()) {
    return normalizeIp(xRealIp.trim());
  }

  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp && cfConnectingIp.trim()) {
    return normalizeIp(cfConnectingIp.trim());
  }

  return "127.0.0.1";
}

function normalizeIp(ip: string): string {
  // Strip IPv4-mapped IPv6 prefix ::ffff:
  if (ip.startsWith("::ffff:")) {
    return ip.slice(7);
  }
  return ip.toLowerCase();
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  retryAfterSeconds: number;
  headers: Record<string, string>;
}

export function checkRateLimit(
  request: Request,
  action: RateLimitAction,
  customPolicy?: RateLimitPolicy
): RateLimitResult {
  const policy = customPolicy ?? DEFAULT_POLICIES[action];
  const ip = getClientIp(request);
  const key = `${action}:${ip}`;
  const now = Date.now();
  const windowMs = policy.windowSeconds * 1000;
  const cutoff = now - windowMs;

  let timestamps = store.get(key) ?? [];
  timestamps = timestamps.filter((t) => t > cutoff);

  const resetSeconds = Math.ceil(
    (timestamps.length > 0 ? timestamps[0] + windowMs - now : windowMs) / 1000
  );

  if (timestamps.length >= policy.maxRequests) {
    const oldest = timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    store.set(key, timestamps);

    const headers: Record<string, string> = {
      "X-RateLimit-Limit": String(policy.maxRequests),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(Math.ceil((now + retryAfterSeconds * 1000) / 1000)),
      "Retry-After": String(retryAfterSeconds),
    };

    return {
      allowed: false,
      limit: policy.maxRequests,
      remaining: 0,
      resetSeconds: retryAfterSeconds,
      retryAfterSeconds,
      headers,
    };
  }

  timestamps.push(now);
  store.set(key, timestamps);

  const remaining = Math.max(0, policy.maxRequests - timestamps.length);
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(policy.maxRequests),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil((now + windowMs) / 1000)),
  };

  return {
    allowed: true,
    limit: policy.maxRequests,
    remaining,
    resetSeconds,
    retryAfterSeconds: 0,
    headers,
  };
}

export function assertRateLimit(
  request: Request,
  action: RateLimitAction,
  customPolicy?: RateLimitPolicy
): Record<string, string> {
  if (process.env.CODEMORPH_DISABLE_RATE_LIMIT === "1" && !customPolicy) {
    return {
      "X-RateLimit-Limit": "1000",
      "X-RateLimit-Remaining": "1000",
      "X-RateLimit-Reset": String(Math.ceil((Date.now() + 60000) / 1000)),
    };
  }

  const result = checkRateLimit(request, action, customPolicy);
  if (!result.allowed) {
    throw new GitHubApiError(
      `Rate limit exceeded for ${action}. Please retry in ${result.retryAfterSeconds} seconds.`,
      429,
      result.headers
    );
  }
  return result.headers;
}

export async function withConcurrencyLimit<T>(
  action: "generate",
  fn: () => Promise<T>
): Promise<T> {
  if (process.env.CODEMORPH_DISABLE_CONCURRENCY_LIMIT === "1") {
    return await fn();
  }

  if (activeGenerations >= MAX_CONCURRENT_GENERATIONS) {
    throw new GitHubApiError(
      "The system is currently running maximum concurrent transformations. Please wait a few moments and retry.",
      429,
      { "Retry-After": "15" }
    );
  }

  activeGenerations += 1;
  try {
    return await fn();
  } finally {
    activeGenerations = Math.max(0, activeGenerations - 1);
  }
}

export function getActiveGenerations(): number {
  return activeGenerations;
}

export function resetRateLimitStore(): void {
  store.clear();
  activeGenerations = 0;
}
