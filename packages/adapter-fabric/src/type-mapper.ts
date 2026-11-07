/**
 * Fabric type mapping between T-SQL / Fabric SQL types and LakeQL primitive
 * types.
 *
 * @module
 */

import { createTypeMapper } from "@lakeql/datasource"
import type { PrimitiveType } from "@lakeql/datasource"

/** Maps normalized Fabric / T-SQL types to LakeQL {@link PrimitiveType}s. */
const FABRIC_TO_PRIMITIVE: Record<string, PrimitiveType> = {
  nvarchar: "String",
  varchar: "String",
  char: "String",
  nchar: "String",
  text: "String",
  ntext: "String",
  xml: "String",
  uniqueidentifier: "String",
  varbinary: "String",
  binary: "String",
  int: "Integer",
  bigint: "Integer",
  smallint: "Integer",
  tinyint: "Integer",
  float: "Float",
  real: "Float",
  decimal: "Float",
  numeric: "Float",
  money: "Float",
  smallmoney: "Float",
  bit: "Boolean",
  date: "Date",
  datetime: "DateTime",
  datetime2: "DateTime",
  datetimeoffset: "DateTime",
  smalldatetime: "DateTime",
  time: "DateTime",
}

/** Maps LakeQL {@link PrimitiveType}s to Fabric / T-SQL type strings. */
const PRIMITIVE_TO_FABRIC: Record<PrimitiveType, string> = {
  String: "NVARCHAR(MAX)",
  Integer: "BIGINT",
  Float: "FLOAT",
  Boolean: "BIT",
  Date: "DATE",
  DateTime: "DATETIME2(3)",
}

/** Shared {@link TypeMapper} for Fabric / T-SQL types. */
export const fabricTypeMapper = createTypeMapper({
  toPrimitive: FABRIC_TO_PRIMITIVE,
  toEngine: PRIMITIVE_TO_FABRIC,
})
