# CodeMorph-AI

CodeMorph-AI is a work in progress: a platform intended to analyze a supported website repository, plan a migration, generate a complete target project, and report what it could verify.

### Current implementation

The current demo accepts a public GitHub repository URL and a migration goal, then displays a source profile and a reviewable rules-based plan. It recognizes static HTML sites and React + Vite projects as supported source paths and explains when it recognizes an unsupported framework. With an OpenAI API key configured, the user can approve the plan and generate a ZIP containing a Next.js + TypeScript project and migration report. The generator reads a bounded set of source files from the pinned commit, redacts common credential patterns, excludes secret/config files, and never runs repository code in the web server. Generated output is sent to a separate, disposable, network-disabled Docker worker for a production build and root-route HTTP check when the validator image is available. Binary assets are not copied.

## First release

The first release is intentionally narrow so that the full workflow can be made reliable and demonstrated end to end.

- **Input:** a public GitHub repository URL and a short description of the desired result.
- **Supported source projects:** static HTML/CSS/JavaScript sites and React projects created with Vite.
- **Target:** Next.js App Router with TypeScript.
- **Output:** a complete generated project that can be downloaded, plus a report describing the source, generated changes, validation results, and remaining manual work.
- **Validation:** attempt a production build and root-route HTTP check in an isolated worker, then report each result accurately. Browser interaction checks are not implemented yet.

StackShift must distinguish what it preserved, changed, newly generated, could not migrate, and could not verify. It must not claim an application or feature works solely because code was generated for it.

## First-release boundaries

The first release will not promise support for arbitrary frameworks or target stacks. It will not initially accept private repositories, uploaded folders or ZIP files, mobile applications, or projects that depend on complex backends and external services. Such support can be considered after the public-repository-to-Next.js flow is reliable.

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

The worker image pins its Node base image by digest and uses the project lockfile. Each validation container runs as a non-root user with no network, no mounted host files, a read-only root filesystem, 1.5 GiB memory, one CPU, 64 processes maximum, and a three-minute limit. It does not install packages from the generated project. If Docker or the image is unavailable, the generated ZIP is still returned and its report says validation was not run. Do not expose this prototype publicly; authentication and persistent abuse limits are still missing.

Run the worker's local acceptance fixtures after the image is built:

```bash
npm run validate:fixtures
```

The known-good fixture should build and return HTTP 200 for `/`. The intentionally invalid fixture should fail its build and skip the route check. This checks the worker boundary only; it does not call OpenAI or measure migration quality.

### Enable AI generation

Create `.env.local` in the repository root and add your own OpenAI API key:

```env
OPENAI_API_KEY=your-api-key
STACKSHIFT_OPENAI_MODEL=gpt-5-mini
```

The model setting is optional; `gpt-5-mini` is the default. Restart the dev server after setting the key. Generation sends the selected source snippets and your goal to OpenAI, and API usage may incur charges. Never commit `.env.local`. This prototype does not yet have user authentication or generation rate limits, so keep it local and do not deploy it publicly.

Useful project commands:

```bash
npm run lint
npm test
npm run build
npm run start
```

See [the product scope](docs/product-scope.md) for the initial user, workflow, constraints, and phase exit criteria.

See the [remaining implementation roadmap](docs/remaining-roadmap.md) for the isolated validation-worker design, prerequisites, exit checks, and remaining release phases.
