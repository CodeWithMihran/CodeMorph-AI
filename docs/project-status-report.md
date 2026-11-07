# StackShift project status report

**Audit date:** 2 November 2026  
**Verdict:** A substantial local prototype with a clear migration workflow, but not yet a verified end-to-end migration product and not safe to deploy publicly.

## Executive verdict

StackShift has a real product shell and the main migration stages are represented in code: public GitHub inspection, a rules-based plan, AI-backed generation, ZIP packaging, and an isolated validation-worker integration. The first four stages are the most complete. The generator and worker are implemented but have not completed a real migration together in this environment.

The two external prerequisites are not configured here: there is no `OPENAI_API_KEY` or `.env.local`, and Docker is unavailable. As a result, this audit could not confirm that a real repository can be transformed, that the generated project builds in the container, or that its homepage serves successfully. The fixture runner confirmed the missing-Docker path and reported `not-run`, as designed.

The current generation scope is much narrower than “turn any website into a fully functional application.” It supports a small set of public repositories and generates a first-pass Next.js homepage and styles. It does not yet migrate an entire multi-page site, copy binary assets, recreate backend behavior, or verify interactions.

**Current stage:** portfolio-grade prototype in progress.  
**Public launch:** not ready.  
**Resume claim:** describe it as an LLM-assisted repository-to-Next.js prototype with a designed isolated validation pipeline; do not claim broad stack support, full feature parity, or verified end-to-end migrations yet.

## What a user can do

| User operation | Current capability | Qualification |
| --- | --- | --- |
| Start the local web app | `npm ci`, then `npm run dev` | The owner previously confirmed localhost worked. This audit did not recheck the browser because local HTTP access was blocked in the audit environment. |
| Submit a repository | Enter a public GitHub repository URL | The UI calls the repository analysis endpoint. A separate metadata lookup endpoint exists but the current UI does not call it. |
| Inspect a source project | See framework classification, file count, likely entry files, route candidates, and a pinned commit | Static HTML and React + Vite are intended. Classification is based mostly on repository metadata and filenames, not a full understanding of runtime behavior. |
| Draft a migration plan | Enter an 8–500 character goal and review preserve/change/create/manual items | This is deterministic rules-based planning, not AI planning. The server rechecks the pinned public repo and derives the plan from server-read file paths. |
| Request code generation | Review the plan, consent to provider submission, and request a ZIP | Requires an OpenAI API key. It submits up to 16 selected source files, with a 16 KB per-file and 96 KB combined source limit. The key is not configured in this environment. |
| Download a generated project | Receive a ZIP with a Next.js + TypeScript scaffold, generated files, and `MIGRATION-REPORT.md` | The generator currently requires `app/page.tsx` and `app/globals.css`, with optional component files. It does not copy binary assets or recreate a complete multi-route/backend application. |
| Validate generated output | Attempt a production build and HTTP 200 check for `/` in a Docker worker | Requires Docker Desktop and the worker image. Without them the ZIP is still returned with validation marked `not-run`. Neither fixture ran in this audit. |

## Completion by phase

| Phase | Status | Evidence and remaining work |
| --- | --- | --- |
| 1. Product scope | Complete | Narrow first-release scope and limitations are documented. |
| 2. Repository submission | Implemented | URL parsing and public GitHub metadata handling exist. The UI uses analysis directly; the separate lookup endpoint appears unused by the UI. |
| 3. Source inspection | Implemented, regression-tested | The analysis code resolves a commit, reads the recursive tree and root manifest, and identifies source candidates. Initial inspection and server-side revalidation share one classifier. |
| 4. Migration planning | Implemented, regression-tested | The server confirms repository identity and pinned commit source, derives supported type/framework, and creates a deterministic plan from server-read file paths without fetching page contents. |
| 5. Code generation | Implemented, unverified | OpenAI Responses API integration, canonical-plan comparison, structured output, path/import checks, a scaffold, and ZIP generation exist. No API key is configured, so no real generation was verified. |
| 6. Build and preview validation | Integrated, unverified | A network-disabled, bounded Docker worker and valid/invalid fixtures exist. Docker is unavailable, so container execution and cleanup were not verified. |
| 7. Public-demo safeguards | Not complete | No user authentication, durable per-user/IP rate limiting, quotas, or abuse controls. Keep the app local. |
| 8. Migration-quality evaluation | Started | Worker correctness fixtures exist; representative source-to-target migration fixtures and quality measurements do not. |
| 9. Reliability/product readiness | Not complete | No persistent jobs/history, queue, progress reporting, cancellation, retry policy, or artifact retention. |
| 10. Portfolio release | Not complete | No verified end-to-end demonstration, measured results, or safe public deployment. |

## Audit checks

- `npm test`: **passed** (7 regression checks, including route-level forged-profile and edited-plan rejection before the model call).
- `npm run lint`: **passed** after the audit changes.
- `npm run build`: **passed** after the audit changes (exit code 0); Next.js completed TypeScript, static generation, and build traces.
- `npm run validate:fixtures`: **not run** (Docker is unavailable). The worker fixture statuses remain unknown until Docker can run them.
- OpenAI generation: **not run**; `OPENAI_API_KEY` and `.env.local` are absent.
- Git state: the `origin` remote is configured and there is an initial commit, but the current application files are mostly untracked and README has local changes. The current work is therefore not included in the existing commit or a push.
- Live browser check: **not verified in this audit**; the environment blocked the local HTTP request. The owner had previously confirmed localhost loaded.

## Important gaps and risks

### P0 — Do not deploy publicly yet

The repository and generation endpoints are unauthenticated and have no persistent usage limits. A public caller could consume GitHub API quota and, once an OpenAI key is configured, trigger provider costs. Add authentication, per-user/IP limits, quotas, abuse monitoring, and request-origin protections before public exposure.

### P1 — The generator is a first-page conversion, not a full migration

The model is instructed to return a homepage, global stylesheet, and optional components. The source tree may contain multiple routes, assets, forms, and services, but those are not migrated as a complete application. The report and UI should keep calling this a first pass until route, asset, and interaction preservation are implemented and measured.

### P1 — Server-side identity validation needs a live GitHub check

Planning and generation confirm repository identity against GitHub, recheck the pinned commit, and derive the source type/framework on the server. Planning reads metadata and paths only; generation reads the selected source contents. Generation rejects a browser-submitted plan that differs from the server-generated plan before calling the model. Regression tests cover the logic with mocked GitHub responses, but a live GitHub/API request and real model call remain unverified.

### P1 — Source redaction is heuristic

The code excludes common secret files and redacts several credential patterns, but it cannot guarantee that every secret-like value in source snippets is found. User consent is present; keep the disclosure explicit and avoid claiming comprehensive secret removal.

### P1 — Static-site detection remains deliberately conservative

The classifier supports a root `index.html` with no runtime dependencies, including manifests that only contain scripts or development tooling. Projects with runtime dependencies outside the narrowly supported React + Vite case remain unsupported to avoid silently dropping required packages. The rule has regression tests, but additional source-to-target fixtures can refine it.

### P2 — User-facing copy was stale

The plan screen now explains the API-key requirement and that build/root-route checks depend on the isolated Docker worker. The migration-plan unknowns now say code has not been semantically analyzed instead of claiming source files were not inspected at all.

### P2 — No durable job workflow

Generation, model calls, and validation happen in one request. The model can wait up to 90 seconds and the worker up to 180 seconds. There is no durable job record, progress, cancellation, or recovery after a client disconnect. This is acceptable only for a local prototype, not a robust hosted service.

## Recommended remaining work, in order

1. When disk space allows, build the validator image and run `npm run validate:fixtures` to verify valid build + HTTP 200 and expected invalid-build failure.
2. Configure your own OpenAI API key when ready, then run one end-to-end migration against a small public React + Vite repository. Inspect the ZIP, report, source preservation, and actual build result.
3. Tighten secret redaction and add more source-to-target evaluation fixtures.
4. Add authentication, durable rate limits, quotas, origin protections, retention policy, and abuse monitoring before public exposure.
5. Build migration-quality fixtures for static, single-route React, and multi-route React sites; measure build success, route coverage, visible-content preservation, interactions, manual gaps, time, and model cost.
6. Add a durable job queue, progress/cancellation/retry, job history, artifact expiry, broader route/asset support, and browser interaction checks.
7. Prepare the portfolio demo and resume claims from measured results only.

## Bottom line

StackShift is beyond a blank starter: it has a credible local workflow and substantial implementation. Its strongest completed story today is **repository inspection + server-revalidated planning + constrained AI generation design**. The critical proof still missing is **a real generated migration that builds, serves, and preserves agreed behavior**. The local production build now passes. Docker and the API key are still optional development prerequisites for the next end-to-end proof; the project remains an in-progress prototype and should stay local until abuse protections are added.
