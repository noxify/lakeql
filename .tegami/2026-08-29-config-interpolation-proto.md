---
packages:
  "npm:@lakeql/config": patch
---

### Fix environment interpolation for special data-source names

`interpolateEnvVariables` now builds its result with a prototype-less object, so a data-source name such as `__proto__` becomes a normal own property instead of silently mutating the prototype chain. Previously such names produced an entry with an undefined adapter value.
