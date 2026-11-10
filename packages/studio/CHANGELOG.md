## @lakeql/studio@0.2.0

### New @lakeql/studio package for the Endpoint Builder

Adds `@lakeql/studio`, the shared UI and logic package for the LakeQL Endpoint Builder. It exports a React `EndpointBuilder` component and a precompiled stylesheet (`@lakeql/studio/styles.css`), so a consumer can render the builder with no Tailwind configuration of its own. The package ships both a library build (ESM + types) and a standalone static bundle from the same source. This first release scaffolds the package, its shadcn/Base UI component set, and the build pipeline; the authoring UI arrives in later releases.

### Endpoint Builder authoring experience

`@lakeql/studio` now ships the full client-side Endpoint Builder. The `EndpointBuilder` component authors a LakeQL endpoint definition through a visual tree editor over a live, schema-validated state and exports a CLI-ready `endpoint.json`.

- Author top-level metadata, add and nest fields of every supported type, set per-field options and validations, and configure the mutation write pipeline, all validated continuously against the canonical endpoint schema so an export can never be a file the CLI would reject.
- See the live JSON alongside the tree, import an existing `endpoint.json` to keep editing it (round-trip stable), export the current definition as a download, and keep in-progress work across reloads via local autosave.
- The field tree is keyboard-navigable with full tree semantics (roles, level, expand/collapse state, roving focus), every authoring action is operable by keyboard with a visible focus indicator, and validation changes are announced to assistive technology through a live region.

The builder is hosted by the new static `editor` app (unpublished).
