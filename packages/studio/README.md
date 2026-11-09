# @lakeql/studio

Shared UI and logic for the LakeQL Endpoint Builder — a client-only experience for authoring validated endpoint definitions.

```tsx
import { EndpointBuilder } from "@lakeql/studio"

import "@lakeql/studio/styles.css"
```

The package ships two build targets from one source: a library (ESM + `.d.ts` via `tsdown`, plus a precompiled `studio.css` built with Vite/Tailwind) consumed by `apps/editor`, and a standalone static bundle for a future `lakeql studio`.

Full documentation lives in `apps/docs` once the API stabilizes.
