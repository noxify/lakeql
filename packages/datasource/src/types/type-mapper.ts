/**
 * Adapter-neutral type mapping between engine-specific data types and the
 * canonical LakeQL primitive type system.
 *
 * @module
 */

/**
 * The canonical LakeQL primitive types used across codegen and metadata.
 *
 * This union mirrors `PrimitiveType` in `@lakeql/schema-generator`
 * (the source of truth). It is duplicated here on purpose: this contract
 * package must not depend on an implementation package. Keep the two in sync.
 */
export type PrimitiveType =
  | "String"
  | "Integer"
  | "Float"
  | "Boolean"
  | "Date"
  | "DateTime"

/**
 * Maps between an adapter's engine-specific data types and LakeQL
 * {@link PrimitiveType}s.
 *
 * Each adapter provides its own implementation that understands its engine's
 * native type system (Trino, T-SQL, etc.).
 */
export interface TypeMapper {
  /**
   * Converts an engine-specific type string to a LakeQL {@link PrimitiveType}.
   *
   * Implementations SHALL normalize the input (case, type parameters) and
   * fall back to `"String"` when the engine type has no known mapping.
   *
   * @param engineType - The engine-specific type string (e.g. `"varchar(255)"`,
   *   `"nvarchar"`, `"bigint"`).
   * @returns The corresponding LakeQL primitive type.
   */
  toPrimitiveType: (engineType: string) => PrimitiveType

  /**
   * Converts a LakeQL {@link PrimitiveType} to the engine's native type string.
   *
   * @param primitiveType - The LakeQL primitive type to convert.
   * @returns The corresponding engine-specific type string (e.g. `"VARCHAR"`,
   *   `"BIGINT"`).
   */
  toEngineType: (primitiveType: PrimitiveType) => string
}
