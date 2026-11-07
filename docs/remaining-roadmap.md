# StackShift: remaining implementation roadmap

This roadmap continues from the current repository-to-Next.js prototype. It keeps the first release focused on public static/React + Vite repositories migrating to Next.js App Router + TypeScript.

## Current state

| Phase | Status | Evidence / remaining work |
| --- | --- | --- |
| 1. Product definition | Complete | First-release scope and acceptance contract are documented. |
| 2. Repository submission | Complete | Public GitHub URL validation and metadata lookup are implemented. |
| 3. Source inspection | Implemented; needs an end-to-end retest | Initial inspection pins a commit. Planning and generation recheck public repo identity and pinned-commit source type/framework using the same classifier. |
| 4. Migration planning | Implemented; regression-tested | The server derives a rules-based plan from repository metadata and paths at the pinned revision; it does not fetch page source during planning. Browser-supplied framework labels are checked against the server profile, with route-level mismatch coverage. |
| 5. Code generation | Implemented; needs an API key and live run | The generator rereads and classifies pinned source server-side, recomputes the canonical plan, and rejects altered profiles/plans before calling OpenAI; route tests assert the model is not called for forged requests. It reads up to 16 bounded files, validates generated paths/content, and returns a ZIP plus report. Binary assets are not copied. |
| 6. Build and preview validation | Implemented; requires Docker to exercise | Generation streams validated project files into a disposable, non-root, network-disabled Docker worker with resource/time limits; it runs a webpack production build and checks `/` returns HTTP 200. `npm run validate:fixtures` checks valid/invalid cases once Docker is available. |
| 7. Safeguards before a public demo | Planned | Authentication, persistent abuse limits, quotas, and deployment protections remain required. |
| 8. Migration quality evaluation | Fixtures in progress | Valid/invalid worker fixtures are ready; source-to-target migration fixtures and quality measurements still need to be built and run. |
| 9. Reliability and product finish | Planned | Durable jobs, cancellation, artifact cleanup, and additional product checks remain. |
| 10. Portfolio release | Planned | Public release remains gated on the earlier security and evaluation work. |

## Phase 6 — isolated validation worker

### Goal

After generation, build the target project and check its main route in a short-lived isolated worker. Return the complete project even when a check fails, and include the actual result in `MIGRATION-REPORT.md`.

### Recommended design

1. The Next.js app remains the control plane and streams the generated project as a tar archive to a separate worker process.
2. Run each job in a disposable, non-root container based on a versioned worker image that includes the pinned dependency lock.
3. Pass files only through container stdin into a bounded tmpfs. Do not mount host files or pass environment files, the model key, GitHub tokens, or production secrets.
4. Apply one CPU, 1.5 GiB memory with no swap, 64 processes, bounded writable tmpfs, a three-minute timeout, and cleanup after completion or timeout.
5. Drop Linux capabilities, enable `no-new-privileges`, use a read-only container root, and disable outbound networking during build and preview.
6. Build the controlled scaffold with dependencies baked into the worker image. Do not install job-supplied packages or run job-supplied lifecycle scripts.
7. After a successful build, start preview in the same sandbox and check `/` over loopback. Add Playwright browser checks in a follow-up.
8. Return bounded, sanitized diagnostics and individual build/route statuses; never translate a build pass into a claim of feature parity.

### Exit checks

- A known-good generated fixture builds and returns HTTP 200 for `/` (requires Docker to be installed and started).
- A deliberately invalid fixture reports a build failure and still returns its downloadable source and report (requires Docker).
- A timeout, missing Docker worker, and container startup failure produce clear `not run` or `failed` results without crashing the web app.
- The worker cannot read a host secret or reach arbitrary network destinations.
- Temporary job files and containers are removed after success, failure, and cancellation.

### Local prerequisite

The worker implementation, fixture projects, runner, and setup command are in place. Install and start Docker Desktop (or configure a separate remote worker) to build the image and exercise `npm run validate:fixtures`. The current host has no Docker or Podman command available, so those container scenarios remain unverified here.

## Phase 7 — safeguards before a public demo

- Add user identity or an equivalent trusted boundary before accepting public traffic.
- Add persistent per-user/IP limits, generation quotas, request-size limits, and abuse monitoring so unauthenticated requests cannot consume the configured model account.
- Keep model credentials server-side. Keep them out of job containers, logs, artifacts, and browser responses.
- Add explicit source-sharing consent, retention/cleanup policy, cancellation, and clear disclosure of model-provider use and possible API charges.
- Threat-model GitHub ingestion, model prompt injection, generated code, archive creation, and the worker boundary.

**Gate:** do not expose generation publicly until authentication, persistent limits, usage caps, and a working isolated worker are in place.

## Phase 8 — migration quality evaluation

Create a migration quality fixture set owned by the project author: one static landing page, one React/Vite portfolio, and one multi-route React/Vite site. (The existing valid/invalid fixtures exercise worker correctness only.) For each migration fixture record the expected pages/content and important interactions. Run the same fixtures after prompt, model, scaffold, or worker changes.

Track build success, route coverage, interaction checks, visible-content preservation, manual gaps, retries, elapsed time, and model cost where available. Keep failures as results; do not tune the report to hide them.

## Phase 9 — reliability and product finish

- Add durable jobs and a queue only when generation outgrows a request/response lifecycle.
- Add job progress, cancellation, safe retries, artifact expiry, cleanup monitoring, and actionable logs.
- Add ZIP and manifest integrity checks, generated-file previews, and clear failure recovery.
- Improve source reading and binary-asset preservation only with per-file and total-size limits.
- Validate accessibility and responsive layout on generated previews.

## Phase 10 — portfolio release

- Publish a demo only after the public-exposure gate is met.
- Document setup, architecture, trust boundaries, known limits, and a few measured migration results.
- Include a before/after walkthrough with the generated ZIP and report.
- Describe the current work accurately as LLM-assisted code generation with a measured validation pipeline; do not claim model training or broad framework support unless implemented.

## Fastest safe build order

1. Later, configure the API key and verify one real generation locally.
2. Build the worker image, run known-good and invalid fixtures, then add browser interaction checks.
3. Add the minimum safeguards required before any public deployment.
4. Build the evaluation fixtures and record baseline results.
5. Polish retention, progress, and the portfolio demo.

Do not spend time on additional frameworks, private GitHub access, billing, or deployment automation until this one migration path can generate, build, preview, and report honestly.
