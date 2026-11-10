# editor

Thin Vite + React SPA shell for the LakeQL Endpoint Builder. It mounts the `<EndpointBuilder />` component from `@lakeql/studio` and imports the package's precompiled stylesheet (`@lakeql/studio/styles.css`). The build output is purely static client assets — no serverless functions, no SSR.

## Vercel deployment

Deployed to `editor.lakeql.dev` as a static site. Because `apps/editor` depends on the `@lakeql/studio` workspace package, the deploy installs and builds from the repository root while serving this app's output. The settings below pair with `vercel.json`:

- **Root Directory**: `apps/editor`, with **"Include files outside the root directory"** enabled (Vercel's default for a detected monorepo) so the workspace is available at install and build time.
- **Install Command** (`vercel.json`): runs at the repo root so pnpm resolves the whole workspace.
- **Build Command** (`vercel.json`): `pnpm turbo build --filter=editor...` — the trailing `...` pulls the Turbo `^build` dependency, so `@lakeql/studio` (library JS/types + CSS) builds before this app, consistent with the workspace build-prerequisite rule.
- **Output Directory**: `dist` (resolved under the `apps/editor` root directory, i.e. `apps/editor/dist`).
- **No serverless functions / no SSR**: the output is static assets only.

The deployment is validated by a Vercel preview build succeeding end-to-end, not merely a local `vite build`.
