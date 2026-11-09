# CodeMorph-AI

CodeMorph-AI is a work in progress: a platform intended to analyze a supported website repository, plan a migration, generate a complete target project, and report what it could verify.

### Current implementation

The current demo accepts a public GitHub repository URL for inspection, auditing, and migration planning. It also accepts a ZIP archive for a source audit only; ZIP-based migration is not implemented. The audit runs bounded deterministic checks for source patterns, JavaScript/TypeScript syntax and imports, and supported npm lockfile advisories. Exact npm package names and versions are sent to OSV for advisory lookup. The migration flow recognizes static HTML sites and React + Vite projects, then shows a reviewable rules-based plan. With an OpenAI API key configured, the user can approve that plan and generate a ZIP containing a Next.js + TypeScript project and migration report. The generator reads a bounded set of source files from the pinned commit, redacts common credential patterns, excludes secret/config files, and never runs repository code in the web server. Generated output is sent to a separate, disposable, network-disabled Docker worker for a production build and root-route HTTP check when the validator image is available. Binary assets are not copied.

## First release

The first release is intentionally narrow so that the full workflow can be made reliable and demonstrated end to end.

- **Input:** a public GitHub repository URL and a short description of the desired result.
- **Supported source projects:** static HTML/CSS/JavaScript sites and React projects created with Vite.
- **Target:** Next.js App Router with TypeScript.
- **Output:** a complete generated project that can be downloaded, plus a report describing the source, generated changes, validation results, and remaining manual work.
- **Validation:** attempt a production build and root-route HTTP check in an isolated worker, then report each result accurately. Browser interaction checks are not implemented yet.

StackShift must distinguish what it preserved, changed, newly generated, could not migrate, and could not verify. It must not claim an application or feature works solely because code was generated for it.

## First-release boundaries

The first release will not promise support for arbitrary frameworks or target stacks. Migration currently accepts public GitHub repositories only; ZIP archives are supported for auditing, not migration. Private repositories, mobile applications, and projects that depend on complex backends and external services remain outside the supported migration path. Such support can be considered after the public-repository-to-Next.js flow is reliable.

## Completion criteria

The first release is complete when a user can:

1. Submit a valid public GitHub repository URL and receive a clear result for supported, unsupported, or inaccessible repositories.
2. Review a traceable source profile and migration plan before generation.
3. Generate and download the complete Next.js project while keeping the source unchanged.
4. See which checks ran, their results, and any unresolved or manual steps.

The migration must be repeatable from a recorded repository revision. Generated code must be built and run outside the main web application process in a resource-limited isolated worker before this service is offered to other users.

## Development

Requirements: Node.js 20.9 or newer and npm.

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Enable isolated validation

Install and start Docker Desktop with Linux containers enabled. Build the dedicated worker image from the project root:

```bash
docker build -f docker/validator/Dockerfile -t stackshift-validator:16.4.3-1 .
```

The worker image pins its Node base image by digest and uses the project lockfile. Each validation container runs as a non-root user with no network, no mounted host files, a read-only root filesystem, 1.5 GiB memory, one CPU, 64 processes maximum, and a three-minute limit. It does not install packages from the generated project. If Docker or the image is unavailable, the generated ZIP is still returned and marked unverified in the app and report. Do not expose this prototype publicly: authentication is not implemented, and rate limits and concurrency controls are in-memory per process rather than shared or durable.

Run the worker's local acceptance fixtures after the image is built:

```bash
npm run validate:fixtures
```

The worker fixtures include a static landing page and a two-route React + Vite migration target. Each generated static route must return HTTP 200; the intentionally invalid fixture must fail its build and skip route checks. `npm test` also runs deterministic source, plan, content, artifact, and source-immutability acceptance checks without calling OpenAI. The route/build fixtures do not call OpenAI or establish full migration quality.

Run the migration evaluation harness to check source classification, route contracts, generated target routes/content, unsupported-source gating, and source immutability. By default it also invokes the isolated Docker worker against known-good, invalid, static-site, and multi-route fixtures:

```powershell
npm run evaluate:migrations
```

If Docker is unavailable, its worker checks are reported as `not-run`, the overall result is `unverified` with a nonzero exit code, and the deterministic checks still run. Use `npm run evaluate:migrations:static` for the deterministic checks only. Both commands write timestamped JSON and Markdown reports under `.codemorph/evaluations/`. This harness does not call OpenAI or make billable live-generation requests; use the app manually with an approved API key after worker checks pass, then record those live results separately.

### Enable AI generation

Create `.env.local` in the repository root and add your own OpenAI API key:

```env
OPENAI_API_KEY=your-api-key
CODEMORPH_OPENAI_MODEL=gpt-5-mini
```

The model setting is optional; the current default is `gpt-4o-mini`. Restart the dev server after setting the key. Generation sends the selected source snippets and your goal to OpenAI, and API usage may incur charges. Never commit `.env.local`. The application has per-process generation rate limits, but no user authentication or shared, durable quotas; keep it local until these controls are added.

Successful compiler repairs can create a pending procedural-rule candidate in the git-ignored `.codemorph/procedural-rules.json` store only when the changed generated code demonstrates a supported transformation. The current curated rule fixture covers React Router `Link` imports and `to` props migrating to Next.js `Link` and `href`; replay checks its exact before/after output and negative scope cases before dashboard review. Only explicitly promoted, fixture-backed rules enter later model prompts. Model repair notes are not stored as rules, and unsupported transformations remain unlearned until an owned fixture is added. The store keeps bounded error signatures, source triggers, canonical fixture resolutions, and aggregate use outcomes; it does not save source files or raw compiler logs. For a persistent mounted location, set `CODEMORPH_RULES_PATH` to that file path before starting the app. This local JSON store is intended for a single deployment instance; a multi-instance service needs a shared durable store and operational access controls. Fixture replay proves the documented mapping and its scope boundaries, not full correctness for every project.

Useful project commands:

```bash
npm run lint
npm test
npm run build
npm run start
```

See [the product scope](docs/product-scope.md) for the initial user, workflow, constraints, and phase exit criteria.

See the [remaining implementation roadmap](docs/remaining-roadmap.md) for the isolated validation-worker design, prerequisites, exit checks, and remaining release phases.
