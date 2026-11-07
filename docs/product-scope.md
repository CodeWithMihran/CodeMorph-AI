# StackShift first-release product scope

## Product statement

StackShift helps a user move a supported website codebase into a Next.js application. It inspects a public GitHub repository, turns the user's goal and repository evidence into a reviewable migration plan, generates the complete target source tree, and reports the checks it actually ran.

## Intended first user

A developer who owns or is authorized to use a public website repository and wants a Next.js starting point without losing track of what was migrated or what still needs work.

## Supported migration contract

| Area | First-release decision |
| --- | --- |
| Source location | Public GitHub repository URL |
| Source projects | Static HTML/CSS/JavaScript and React + Vite |
| Target | Next.js App Router + TypeScript |
| User input | Repository URL and a concise migration goal |
| Generated output | Full project tree, packaged for download |
| Report | Detected source, plan, files changed, build/check results, limitations, manual steps |
| Source integrity | Original repository is read-only; generation happens in a separate workspace |
| Traceability | Record repository owner/name and the resolved commit SHA for each job |

A repository can be recognized but still be unsupported. The UI and report must distinguish invalid input, inaccessible repositories, unsupported source projects, failed migrations, and successful checks.

## User journey

1. The user enters a public GitHub repository URL and describes the desired result.
2. StackShift validates the URL as a GitHub repository reference and retrieves repository metadata and a pinned source revision.
3. StackShift inspects the repository without executing its scripts and presents the detected framework, relevant files, routes where detectable, and limitations.
4. StackShift proposes what it will preserve, change, create, and leave for manual setup.
5. The user reviews the plan and starts generation.
6. StackShift writes the output into a separate job workspace, then builds it in an isolated worker.
7. The user receives the complete source archive and an honest report of validation results and unresolved work.

## Non-goals for the first release

- Arbitrary source or target frameworks; source-to-target support must be explicitly listed.
- Private GitHub repositories, GitHub write access, pull-request creation, and account linking.
- Local folder upload or ZIP-based migration. (ZIP archives are currently accepted for source auditing only.)
- Native mobile apps or deployment to a hosting provider.
- Recreating backend business logic, databases, authentication, payments, or third-party integrations without explicit support and required configuration.
- Claiming visual equivalence, complete feature parity, or successful functionality without checks that support those claims.
- Training a new foundation model. The AI contribution is repository understanding, structured planning, constrained code transformation, repair, and measured evaluation.

## Product principles

- **Evidence before generation:** base plans on repository files, metadata, and bounded inspection rather than a repository-wide unstructured prompt.
- **Review before expensive work:** show the user the migration plan and known limitations first.
- **Preserve the source:** never modify or push to the submitted repository in the first release.
- **Complete output:** return all generated project files, not only a diff or code excerpt.
- **Honest validation:** report checks individually and distinguish untested behavior from passing behavior.
- **Least privilege and isolation:** treat repository contents and generated code as untrusted; keep credentials out of build jobs and apply resource limits.

## First-release acceptance criteria

The product is ready for a first external demo when all of these are true:

1. A valid public repository can be submitted, and malformed, inaccessible, empty, oversized, or unsupported inputs receive understandable outcomes.
2. Each job is tied to an immutable commit SHA and has a visible status and useful failure reason.
3. The source analysis produces a concise, structured project profile with supporting file paths.
4. The migration plan is reviewable and records preservation goals, proposed work, known gaps, and required user configuration.
5. Generation produces a self-contained Next.js + TypeScript project in a separate workspace and does not change the source.
6. A generated artifact can be downloaded and opened as a project.
7. A report identifies build status, routes/interactions checked, checks not performed, unresolved issues, and required manual setup.
8. Repository scripts and generated code are never executed in the web server process; build execution is isolated and resource-limited.
9. A small permission-cleared evaluation set records build success, route coverage, key interaction outcomes, preservation observations, unresolved issues, retries, and elapsed time.
10. The README and demo describe only capabilities that the implementation and evaluation actually support.

## Phase exit criteria

| Phase | Exit condition | Status |
| --- | --- | --- |
| 1. Product definition | This scope and README are agreed as the first-release contract. | Complete: scope and README are documented. |
| 2. Submission experience | User can submit a public repo and see repository identity and clear input errors. | Complete: metadata lookup and invalid-link feedback are implemented; valid and invalid URLs were checked. Source files are not inspected yet. |
| 3. Source inspection | Supported projects receive a traceable profile; unsupported projects are identified with a reason. | Complete: public repo metadata, default-branch commit pinning, bounded Git tree inspection, root package manifest classification, key files, and route candidates are shown. No repository scripts run. |
| 4. Migration planning | User can review a structured plan before generation. | Complete: user states the goal, receives a rules-based plan tied to the inspected commit and file-path evidence, sees explicit unknowns/manual work, and can acknowledge review. No code is generated in this phase. |
| 5. Code generation | A complete target project is generated separately from the source. | In progress: bounded pinned-commit ingestion, server-side OpenAI Responses integration, output validation, and ZIP packaging are implemented. A real generation still requires a configured API key and hands-on review. Binary assets and source projects beyond the current source-file limits are not migrated yet. |
| 6. Validation and artifact | Build/check results and a downloadable project are returned with a truthful report. | Implemented: isolated Docker worker runs a webpack production build and checks `/`; missing Docker/image returns the ZIP with explicit `not-run` statuses. Known-good and invalid worker fixtures are ready; container execution remains unverified until Docker is available. See [remaining roadmap](remaining-roadmap.md). |
| 7. Isolation and safeguards | Execution has a clear trust boundary, resource limits, cleanup, and no production secrets. | Planned; required before public deployment. |
| 8. Evaluation | Representative projects are measured repeatably and results are documented. | In progress: known-good/invalid worker fixtures exist; source-to-target migration fixtures and measurements remain. |
| 9. Product readiness | The workflow is understandable to a first-time user, errors are recoverable, and artifacts/jobs have retention rules. | Planned. |
| 10. Portfolio release | A public demo, setup guide, architecture, measured results, and an accurate resume description are ready. | Planned. |

## Risks to resolve during implementation

- **Repository ingestion and SSRF:** accept only the intended GitHub URL form, use GitHub-hosted endpoints, validate redirects/hosts, enforce time and size limits, and avoid fetching arbitrary user-provided URLs.
- **Public endpoint abuse:** the current lookup is unauthenticated and can consume GitHub's unauthenticated API quota. Add effective per-user or per-IP rate limiting and abuse monitoring before exposing the service publicly; an in-memory counter is not sufficient for a multi-instance deployment.
- **Model cost abuse:** generation uses a server-side OpenAI key and is currently unauthenticated. Keep this prototype local until authentication, persistent rate limits, quotas, and abuse monitoring protect provider spend.
- **Archive handling:** if archive extraction is used, guard against path traversal, symlinks, file-count/depth bombs, and compressed-to-expanded size abuse.
- **Untrusted project scripts:** do not run dependency installation, build commands, or preview servers in the Next.js web process. Use a separate short-lived worker with explicit CPU, memory, disk, time, and network policy.
- **Secrets:** never return `.env` values or expose secrets found in a repository to the model or logs. Only report variable names when needed.
- **AI reliability:** constrain model output with explicit schemas, retain source and plan context, cap repair iterations, and measure changes against the same evaluation set.
- **Visual and behavior drift:** report what was checked; build success is not equivalent to functional or visual parity.

## Scope-change rule

Add another source type or target stack only after the current supported path has an end-to-end acceptance run and evaluation results. Each new combination needs its own fixtures, migration expectations, checks, and documented limitations.
