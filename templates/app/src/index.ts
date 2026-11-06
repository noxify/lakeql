import { createLakeQLApp } from "@lakeql/api/create-app"

import { tokenResolver } from "./auth"

// `createLakeQLApp` loads lakeql.config.ts, builds the runtime and auth
// resolver, composes the API server, and registers SIGTERM/SIGINT shutdown.
// Permission rules and the empty-permissions warning come from the loaded
// config. The only option you usually have to supply is `tokenResolver`.
//
// Want full control? Eject by inlining the wrapper's wiring — the expanded,
// copy-paste form is documented at:
// https://lakeql.dev/docs/api/server-setup/create-lakeql-app#eject
const app = await createLakeQLApp({
  tokenResolver,
  baseDir: import.meta.dirname,
  schemaPath: "./schemas",
  graphqlPath: "/graphql",
  healthCheckEndpoint: "/live",
})

await app.start()
