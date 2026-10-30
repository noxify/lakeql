import type { PrimitiveType, TypeMapper } from "@lakeql/datasource"

/**
 * A Trino-like {@link TypeMapper} fixture for exercising the CLI codegen
 * pipeline without depending on an adapter package. The exhaustive engine-type
 * mapping tables are tested in the adapter packages themselves.
 */
export function trinoLikeTypeMapper(): TypeMapper {
  return {
    toPrimitiveType: (engineType: string): PrimitiveType => {
      const normalized = engineType.toLowerCase().replaceAll(/\(.*\)/gu, "")
      switch (normalized) {
        case "integer":
        case "bigint":
        case "int":
        case "smallint":
        case "tinyint": {
          return "Integer"
        }
        case "double":
        case "real":
        case "float":
        case "decimal":
        case "numeric": {
          return "Float"
        }
        case "boolean": {
          return "Boolean"
        }
        case "timestamp": {
          return "DateTime"
        }
        case "date": {
          return "Date"
        }
        default: {
          return "String"
        }
      }
    },
    toEngineType: (primitiveType: PrimitiveType): string => primitiveType,
  }
}
