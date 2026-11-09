// Framework-agnostic core of the Endpoint Builder: state model, schema
// binding, validation gate, mapping, IO, and persistence.
//
// Phase 1 scaffolds the module boundary only. The implementations land in
// Phase 2 (core model, schema binding, validation) and later phases; nothing
// is exported yet so the browser bundle pulls in no logic prematurely.

export const CORE_PLACEHOLDER = true
