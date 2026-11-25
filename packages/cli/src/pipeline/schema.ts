// Re-export everything from the canonical source
export {
  endpointDefinitionSchema,
  fieldDefinitionSchema,
  fieldNamePattern,
  metadataFieldPattern,
  primitiveTypes,
  findDuplicateFieldNames,
  findReservedNameCollisions,
  deriveAutoFillColumns,
  effectiveWriteMethod,
  flattenEndpointIssues,
  ENDPOINT_SCHEMA_VERSION,
  isSupportedVersion,
  type EndpointDefinitionFormat,
  type FieldDefinition,
  type ArrayItemDefinition,
  type PrimitiveType,
} from "@lakeql/schema-generator/endpoint-schema"
