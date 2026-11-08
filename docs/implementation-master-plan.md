# CodeMorph AI: Product and Engineering Master Plan

**Purpose:** evolve the current StackShift prototype into a trustworthy codebase auditor and migration workbench. This plan is designed to make the product impressive through measured, reliable results rather than broad unsupported claims.

## Product definition

CodeMorph AI accepts a source codebase, explains what it can verify about its quality and migration options, lets the user approve a proposed transformation, and returns a complete target project with an evidence-based report. It never changes the submitted source. Every result distinguishes deterministic findings, model suggestions, checks actually run, and behavior that remains unverified.

### Core user journey

1. Submit a public GitHub repository or a ZIP archive.
2. Review source identity, commit/archive fingerprint, detected languages/frameworks, size, and ingestion warnings.
3. Review a source audit and migration feasibility assessment with evidence and confidence.
4. Choose a target (initially Next.js App Router) and describe desired changes.
5. Review and approve the migration plan, files in scope, data sharing, and expected cost/limits.
6. Watch progress as analysis, transformation, validation, and bounded repair run.
7. Download the complete project and Markdown report; inspect optional PDF output.
8. Rate the result or flag a finding. Feedback improves evaluation data; it does not automatically become a production rule.

## Product rules

- **Evidence first:** each finding names a file and location or explains why it is repository-level. Separate confirmed tool output from AI hypotheses.
- **No fake precision:** health and feasibility scores are explainable summaries of weighted checks, with coverage and uncertainty shown. Avoid unsupported claims like “94% migratable.”
- **No silent destructive changes:** original source is read-only; generated work happens in a fresh job workspace.
- **Review before expensive work:** show plan, files, model use, and likely checks before generation.
- **Validation is not parity:** a successful build or HTTP response does not establish complete functionality, accessibility, or production readiness.
- **Learning is gated:** only sanitized, reproducible, human-reviewable and test-backed migration rules can become reusable knowledge.
- **Least privilege:** repository archives and generated projects are untrusted inputs; never execute them in the web app process.

## Recommended initial scope

Build the audit and migration workflow around JavaScript/TypeScript repositories first. Retain the existing static HTML and React + Vite to Next.js path as the first end-to-end vertical slice. Add React CRA only after fixture coverage. Treat React web to React Native/Expo as a separate target adapter with its own scaffold, transformation rules, and checks; do not promise it until the Next.js path has repeatable results.

Use TypeScript/Node.js for the web product, orchestration, GitHub/ZIP handling, JavaScript/TypeScript parsing, and current transformations. Keep analyzers behind interfaces so native tools (ESLint, TypeScript, Semgrep, OSV, etc.) can be invoked as pinned worker tools. Add a Python service only if a later, measured requirement is materially better served by its ecosystem; avoid two runtimes in the first release.

## Target architecture

```text
Next.js UI / API (control plane)
  ├─ auth, consent, quotas, job creation, progress stream
  ├─ GitHub and ZIP intake -> immutable source manifest
  ├─ orchestrator state machine -> audit -> plan -> transform -> validate -> report
  ├─ PostgreSQL: jobs, events, findings, artifacts metadata, rule versions
  ├─ object storage: encrypted source snapshots and output artifacts with TTL
  └─ isolated worker queue
       ├─ static analyzers and AST/dependency graph tools
       ├─ model calls using bounded, redacted context
       ├─ generated build/test in disposable sandbox
       └─ bounded diagnostics/results returned to control plane
```

For a local portfolio phase, the existing Next.js application can remain a modular monolith and use a local job runner plus Docker. Before public multi-user use, split long-running workers from the request-serving process and use a durable queue/checkpoint store. Make the orchestrator a typed state machine whether or not LangGraph.js is adopted: explicit nodes, schema-validated state, idempotent steps, checkpointing, retry policy, human approval pauses, and cancellation. Evaluate LangGraph.js against a small custom workflow before committing; the workflow semantics matter more than the framework brand.

### Core domain records

- `Job`: owner, source kind, immutable revision/fingerprint, requested target/goal, state, timestamps, cancellation and retention state.
- `SourceManifest`: normalized paths, file hashes/sizes, detected languages/frameworks, excluded paths/reasons, provenance.
- `Finding`: stable rule ID, category/severity, confidence, evidence locations, explanation, suggested fix, analyzer/model provenance, suppression status.
- `FeasibilityAssessment`: supported capabilities, unsupported constructs/dependencies, coverage denominator, weighted score inputs, confidence and caveats.
- `MigrationPlan`: target adapter/version, file actions, dependency mapping, known unknowns, expected validation and approval snapshot.
- `Artifact`: generated manifest, digest, size, format, expiry, download authorization.
- `ValidationRun`: tool/image versions, command class, isolation profile, status, bounded logs, duration, tested routes.
- `LearningCandidate`: proposed rule, sanitized example, originating job, replay fixture, review state, version and performance evidence.

## Feature-to-implementation plan

### 1. Ingestion and accessibility

**GitHub:** retain canonical URL parsing and pinned commit SHA. Handle API rate-limit headers with backoff and avoid repeated tree/blob requests. For large or truncated trees, inspect subtree-by-subtree or return a clear capped/partial status. Support private repositories only through an explicit GitHub App/OAuth flow with least-privilege read-only permissions; never ask users to paste long-lived tokens into the form.

**ZIP:** accept only ZIP; enforce compressed size, expanded byte count, file count, nesting depth, compression ratio, and time limits. Normalize every path; reject absolute paths, traversal, drive prefixes, symlinks and duplicate normalized names. Exclude `.git`, `node_modules`, build outputs, caches, and secret/config contents. Keep an exclusion manifest so the report explains coverage. Do not extract with unsafe defaults.

Both paths produce the same immutable `SourceManifest`; GitHub jobs pin a SHA, ZIP jobs pin a cryptographic archive/file-manifest digest. Enforce content and request limits before model use.

### 2. Repository audit

Run fast deterministic checks before any model review:

- Parse manifests, lockfiles, TypeScript configuration, routes and import graph.
- Run syntax/type/lint checks when safe and supported.
- Scan secrets without transmitting detected values; return locations and remediation guidance only.
- Check dependency advisories against a versioned vulnerability source/tool; show database timestamp and distinguish direct/transitive dependencies.
- Add language-specific static rules for common correctness, security, accessibility and performance patterns.
- Group files by module/dependency context for optional AI review. AI findings must be schema-validated, deduplicated against deterministic findings, cited to exact source ranges, and labeled as suggestions until verified.

Audit coverage must say which files/tools were skipped and why. Never claim every defect has been found. Health grade should be computed from named dimensions (security, correctness, maintainability, performance, accessibility, coverage), expose weights and missing coverage, and avoid a single score hiding a critical finding.

### 3. Feasibility and migration planning

Create a capability matrix per source/target pair: supported constructs, transforms, manual work, and out-of-scope services. Compute feasibility from detected feature coverage and known unsupported items, not an LLM's ungrounded percentage. Show confidence, evidence, file coverage, and the reasons lowering the score.

Generate a plan with file-level actions (preserve, transform, create, exclude, manual), dependencies to replace, routes/components in scope, environment-variable names (never values), likely breaking changes, validation commands, and known unknowns. Bind user approval to a canonical plan hash and source revision so edited/stale client data cannot authorize a different operation. Keep approval and model-data consent explicit.

### 4. Migration adapters

Define `SourceAdapter`, `TargetAdapter`, `Analyzer`, and `TransformStep` interfaces. Transform using deterministic AST codemods where the mapping is mechanical; use the model for semantic gaps with focused context; never rely on blind whole-repository prompts.

**First adapter: static / React Vite -> Next.js App Router + TypeScript.** Improve the existing generator to map routes, styles and text assets within limits, preserve dependency intent, and explicitly report unsupported dynamic behavior. CRA can follow with fixtures. For `react-router-dom`, map route definitions to App Router file structure and verify route coverage. Convert data fetching only when semantics permit; leave client-only/authenticated cases as explicit manual tasks rather than forcing Server Actions.

**Later adapter: React web -> React Native/Expo.** Build a separate target scaffold and rules for JSX primitives, styles, images, browser APIs/storage, navigation, forms and platform permissions. Provide dependency replacements and manual work for web-only libraries. Validate with TypeScript and Expo export; browser DOM replacements alone are not a complete native migration. Add simulator/device checks before making claims about native behavior.

Each adapter has versioned transformation steps, deterministic fixtures, idempotency tests, expected output snapshots where useful, and a documented capability table.

### 5. Agent, repair and learning

Use a bounded workflow: `intake -> analyze -> audit -> assess -> plan -> approval -> transform -> static checks -> sandbox validation -> repair (bounded) -> package -> report`. Set per-job limits for model calls, input/output tokens, wall time, repair attempts and spend. Repair only from relevant diagnostics and affected files; preserve a diff and rationale for each attempt. Stop and report when a failure is not safely repairable.

Persist workflow checkpoints and append-only stage events for recovery and progress streaming. Persist raw structured state and references/hashes rather than repeatedly storing large prompt strings. Make steps idempotent and retry only transient failures.

Do not let production jobs write directly into shared procedural memory. A candidate rule must be sanitized, stripped of secrets/project identifiers, reproducible from a minimized fixture, pass regression tests across positive and negative cases, reviewed, versioned, and monitored for regression. The local prototype now stores compact model-proposed notes as pending candidates only after a repaired build and required route checks pass. Deterministic positive/negative retrieval replay runs before promotion, and the dashboard requires explicit human review; only promoted rules reach prompts. Use remains source/target/trigger-scoped, entries are untrusted hints, and aggregate pass/fail/unverified outcomes are tracked. Before shared production memory, add curated regression fixtures, additional rule lifecycle controls, monitoring, rollback, and expiration. Store rules as structured relational records first; add embeddings only if retrieval evaluations prove useful. Track whether retrieved rules improve success, cost, or repair counts.

### 6. Validation and sandboxing

Separate trusted orchestration from untrusted source/generated code. Pin worker images and tool versions. Use disposable isolated jobs, non-root identity, no network by default, read-only base filesystem, bounded writable scratch, dropped capabilities, default/restrictive seccomp, CPU/memory/process/time/output limits, and cleanup on all exit paths. Never mount host source or secrets. If package installation is needed, use a controlled dependency cache or allowlisted proxy with integrity checks; do not silently enable arbitrary egress.

Validation levels:

1. Input/archive and manifest checks.
2. Parsing, type/lint/static analysis.
3. Unit tests where present and safe.
4. Target production build/export.
5. Root and discovered route HTTP checks.
6. Browser interactions/accessibility checks only after those checks are implemented and measured.

Report each result independently (`passed`, `failed`, `not-run`, `partial`) with tool versions, coverage and sanitized bounded diagnostics. Resource limits are required because containers otherwise can consume host resources; network disablement and least privilege reduce the consequences of executing untrusted projects. [Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints), [Docker rootless mode](https://docs.docker.com/engine/security/rootless/), [Docker seccomp](https://docs.docker.com/engine/security/seccomp/).

### 7. Reports and artifacts

Produce `CODE-AUDIT-REPORT.md`, `MIGRATION-REPORT.md`, and a combined downloadable report; PDF can be a later export of the same structured report data. Include:

- Source identity, revision/fingerprint, analyzed file counts and exclusions.
- Health dimensions and coverage, with findings grouped by severity and exact evidence.
- Feasibility rationale and unsupported capabilities.
- Plan and approval revision, target/tool versions, generated/changed/preserved files.
- Dependency mapping, breaking changes, required environment variable names, manual steps.
- Build/type/lint/test/route results, duration, retries, unverified behavior and diagnostics.
- Artifact manifest and setup instructions.

Do not label generated output “production-ready” unless a defined production-readiness gate exists and has been met.

### 8. UX, jobs and operations

Build a dashboard around a durable job timeline, not a single long request. Stream append-only events over SSE initially; persist them so reconnecting clients can catch up. Show stage, counts, current action, elapsed time, retry status, cancellation, and actionable failure. Avoid exposing source code or secrets in logs/progress. Add job history, artifact expiry, deletion controls, and understandable consent on source/model use.

Before public deployment implement authentication, per-user/IP quotas, request and concurrency limits, abuse monitoring, billing/cost controls, CSRF/origin controls where applicable, retention/deletion policy, audit logs, incident response, and provider failure handling. Private GitHub access requires a separate security review and narrow permissions.

## Delivery phases and exit gates

| Phase | Work | Exit gate |
|---|---|---|
| 0. Product definition | Adopt this scope; settle initial target and truthful claims; name/brand decision. | Supported matrix and first user journey approved. |
| 1. Foundations | Domain schemas, capability registry, job states, error taxonomy, source manifest, limits, architecture boundaries. | Schemas and job flow documented; static and dynamic concerns isolated. |
| 2. Secure ingestion | Harden GitHub pinning/rate handling and implement ZIP intake with traversal/bomb tests. | Adversarial archive fixtures pass; immutable manifest is reproducible; no source execution. |
| 3. Audit MVP | Deterministic parsers/scanners, dependency graph, findings model, coverage-aware report and dashboard. | Fixture repositories produce stable evidence-backed findings; false-positive review recorded. |
| 4. Feasibility and plans | Capability matrix, explainable score inputs, canonical approval snapshot, consent and cost disclosure. | Unsupported cases fail clearly; stale/forged plans rejected. |
| 5. Next.js migration vertical slice | Complete static/Vite to Next.js from pinned fixtures, including generated project and Markdown report. | At least three owned/permission-cleared fixtures repeatedly build; route/content expectations measured; source remains unchanged. |
| 6. Durable jobs and progress | Queue/checkpoints, SSE replay, cancellation, retries, job history, retention. | Kill/restart/reconnect scenarios recover without duplicate artifacts or unsafe repeated steps. |
| 7. Repair loop and learning candidates | Bounded repair; candidate rule store; replay and human approval tooling. | Repair improves held-out fixture results without regression; no direct unreviewed memory writes. |
| 8. React Native/Expo target | Separate adapter/scaffold, browser API and routing mappings, Expo checks. | Representative web-to-native fixtures pass defined checks; remaining manual work disclosed. |
| 9. Product hardening | Authentication, persistent quotas, cost/abuse limits, security review, data lifecycle, monitoring. | Threat model and operational controls reviewed; public access gate met. |
| 10. Portfolio/demo release | Accurate demo, architecture and trust-boundary docs, measured results, screenshots/walkthrough. | Public demo only after phase 9; performance and quality claims backed by published evaluation. |

## Evaluation and quality bar

Create a permission-cleared benchmark containing small static, Vite, CRA, multi-route, and later Expo-target fixtures. Include intentionally invalid, unsupported, large, secret-containing, archive traversal, and dependency-risk cases. Keep a held-out fixture set for tuning.

Track per run: ingestion success, audit precision/recall on known findings, false-positive rate by category, file/route coverage, feasibility calibration, build success, route checks, preserved visible content, interaction checks, unresolved/manual items, repair attempts, elapsed time, model/tool cost, and sandbox failures. Compare every prompt, rule, model, scaffold and worker-image change to the same baseline. Do not claim “self-improving” until these metrics improve on held-out examples without safety regressions.

## Key risks and controls

- **Untrusted content and prompt injection:** treat repository text as data; keep tool privileges out of model calls; validate model output against schemas and allowlists.
- **Archive and resource abuse:** strict compressed/expanded limits, path validation, timeouts, quotas, bounded diagnostics.
- **Secret exposure:** scan locally, redact before provider calls, avoid secret values in reports/logs, keep provider keys outside workers.
- **False audit claims:** evidence locations, confidence, tool provenance, coverage disclosures, user feedback and regression corpus.
- **Model cost and unreliable repairs:** explicit consent, budgets, bounded attempts, deterministic checks and graceful stop.
- **GitHub quotas:** cache by immutable SHA, respect retry guidance and rate-limit headers. GitHub's tree endpoint caps recursive results at 100,000 entries/7 MB and signals truncation; plan for partial/subtree inspection instead of treating all repositories uniformly. [Git Trees API](https://docs.github.com/en/rest/git/trees), [Rate-limit troubleshooting](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api).
- **Premature multi-framework scope:** one well-measured migration adapter is more valuable than several unverified converters.
- **Privacy and retention:** explicit consent, minimum retention, deletion and artifact-expiry controls before hosting third-party code.

## First implementation sequence for this repository

1. Preserve the current working migration flow and inventory existing safeguards/tests before refactoring.
2. Define shared domain schemas and a versioned capability registry around the current GitHub analysis/plan/generation routes.
3. Refactor request/response migration work into a job-oriented service boundary while keeping the current flow usable locally.
4. ✅ Add bounded ZIP intake after archive threat fixtures and safe parsing boundaries are in place.
5. ✅ Add the first deterministic audit and dual report before expanding target frameworks. The current pass includes parser/import checks and an optional OSV npm-lockfile lookup; it is a baseline, not a comprehensive security or quality audit.
6. Improve the existing Next.js adapter with fixture-driven route, dependency, and content preservation.
7. Add persisted progress/checkpoints and then bounded repair.
8. Add gated learning candidates and measure them before enabling any retrieval in generation.
9. Implement Expo as a separate adapter after the Next.js acceptance suite is repeatable.
10. Complete deployment safeguards and evaluation before a public launch.

## Current project gaps this plan addresses

The repository now has public GitHub inspection, static/React + Vite classification, a rules-based plan, bounded/redacted model input, validated generated-file paths, ZIP packaging and audit upload, safe ZIP parsing, pinned GitHub archive audits, a deterministic source audit with TypeScript parser/import checks, npm lockfile advisory lookups through OSV, and a Markdown report. This audit is still intentionally bounded: it does not run user code, project builds, configured lint/tests, full secret history or dependency checks for non-npm lockfiles. The project still needs feasibility/health scoring, durable job progress, bounded repair, reviewed persistent learning, CRA or React Native conversion, browser interaction checks, authentication, and public-service abuse controls. The existing implementation should be treated as a valuable first adapter/prototype, not thrown away or presented as the complete destination.

## Official references

- [LangGraph.js workflow design and human review](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph)
- [GitHub REST API Git Trees](https://docs.github.com/en/rest/git/trees)
- [GitHub REST API rate-limit troubleshooting](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api)
- [Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints)
- [Docker rootless mode](https://docs.docker.com/engine/security/rootless/)
- [Docker seccomp](https://docs.docker.com/engine/security/seccomp/)
