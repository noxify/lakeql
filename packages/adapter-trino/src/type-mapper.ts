/**
 * Trino type mapping between Trino SQL types and LakeQL primitive types.
 *
 * @module
 */

import { createTypeMapper } from "@lakeql/datasource"
import type { PrimitiveType } from "@lakeql/datasource"

/** Maps normalized Trino types to LakeQL {@link PrimitiveType}s. */
const TRINO_TO_PRIMITIVE: Record<string, PrimitiveType> = {
  varchar: "String",
  char: "String",
  text: "String",
  json: "String",
  uuid: "String",
  varbinary: "String",
  bigint: "Integer",
  integer: "Integer",
  int: "Integer",
  smallint: "Integer",
  tinyint: "Integer",
  double: "Float",
  real: "Float",
  decimal: "Float",
  numeric: "Float",
  boolean: "Boolean",
  date: "Date",
  timestamp: "DateTime",
  "timestamp with time zone": "DateTime",
}

/** Maps LakeQL {@link PrimitiveType}s to Trino type strings. */
const PRIMITIVE_TO_TRINO: Record<PrimitiveType, string> = {
  String: "VARCHAR",
  Integer: "BIGINT",
  Float: "DOUBLE",
  Boolean: "BOOLEAN",
  Date: "DATE",
  DateTime: "TIMESTAMP(3)",
}

/** Shared {@link TypeMapper} for Trino SQL types. */
export const trinoTypeMapper = createTypeMapper({
  toPrimitive: TRINO_TO_PRIMITIVE,
  toEngine: PRIMITIVE_TO_TRINO,
})
