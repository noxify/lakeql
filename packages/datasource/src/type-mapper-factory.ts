/**
 * Shared factory for building a {@link TypeMapper} from two lookup records.
 *
 * @module
 */

import type { PrimitiveType, TypeMapper } from "./types/type-mapper"

/**
 * Lookup tables that define an adapter's type mapping in both directions.
 */
export interface TypeMapperTables {
  /**
   * Maps a normalized engine type (lowercased, without parameters) to a LakeQL
   * {@link PrimitiveType}. Unknown engine types fall back to `"String"`.
   */
  toPrimitive: Record<string, PrimitiveType>
  /** Maps each LakeQL {@link PrimitiveType} to the engine's native type string. */
  toEngine: Record<PrimitiveType, string>
}

/**
 * Normalizes an engine type for lookup: lowercased, without parameters
 * (e.g. `varchar(255)` → `varchar`), trimmed.
 */
function normalize(engineType: string): string {
  return engineType
    .toLowerCase()
    .replaceAll(/\(.*\)/gu, "")
    .trim()
}

/**
 * Builds a {@link TypeMapper} from an adapter's engine↔primitive lookup tables.
 *
 * The returned `toPrimitiveType` normalizes its input before the lookup and
 * falls back to `"String"` for unknown engine types. `toEngineType` reads the
 * mapping for the closed {@link PrimitiveType} union.
 *
 * @param tables - The adapter's bidirectional type-mapping tables.
 * @returns A {@link TypeMapper} backed by the supplied tables.
 */
export function createTypeMapper(tables: TypeMapperTables): TypeMapper {
  const { toPrimitive, toEngine } = tables
  return {
    toPrimitiveType(engineType: string): PrimitiveType {
      return toPrimitive[normalize(engineType)] ?? "String"
    },
    toEngineType(primitiveType: PrimitiveType): string {
      return toEngine[primitiveType]
    },
  }
}
