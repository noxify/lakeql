---
packages:
  "@lakeql/api":
    type: patch
---

### `DefinedApiConfig` now reflects every runtime config field

The object returned by `defineApiConfig` always spread the full runtime config, including `onError`, but the `DefinedApiConfig` type restated the fields by hand and omitted `onError`. The type now extends `ApiRuntimeConfig`, so `onError` and any other runtime field are visible on the returned value without a cast. The returned object is unchanged; only the type was out of sync.
