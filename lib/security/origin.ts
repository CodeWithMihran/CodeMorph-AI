import { GitHubApiError } from "@/lib/github/api";

export function assertSameOrigin(request: Request, message = "Requests must originate from this application."): void {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const reqUrl = new URL(request.url);
      const hostHeader = request.headers.get("x-forwarded-host") || request.headers.get("host");

      const originHost = originUrl.host;
      const reqHost = reqUrl.host;

      const hostMatches = originHost === reqHost || Boolean(hostHeader && originHost === hostHeader);
      const isLoopback =
        (originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1") &&
        (reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1") &&
        originUrl.port === reqUrl.port;

      if (!hostMatches && !isLoopback) {
        throw new GitHubApiError(message, 403);
      }
    } catch (error) {
      if (error instanceof GitHubApiError) throw error;
      throw new GitHubApiError(message, 403);
    }
  }

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite === "cross-site") {
    throw new GitHubApiError(message, 403);
  }
}
