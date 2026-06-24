---
"@lakeql/api": minor
---

Conditionally register `builder.mutationType({})` based on discovered schema files

The GraphQL Mutation type is now only registered when at least one `mutation-schema.*` file is found in the schema directory. This prevents the Pothos error "Type Mutation must define one or more fields" when no mutations are configured, while automatically enabling mutations when mutation schema files exist. Users no longer need to manually call `builder.mutationType({})` in their generated code.
