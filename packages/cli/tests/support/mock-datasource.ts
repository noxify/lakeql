import type { DataSource, PrimitiveType } from "@lakeql/datasource"
import { vi } from "vitest"

import type { ResolvedDataSource } from "@/resolve-datasource"

/**
 * Builds a stub {@link DataSource} for CLI command tests. Metadata methods
 * resolve to empty arrays by default; individual tests can override them.
 */
export function makeStubDataSource(
  overrides: Partial<DataSource> = {}
): DataSource {
  return {
    adapter: "trino",
    typeMapper: {
      toPrimitiveType: (): PrimitiveType => "String",
      toEngineType: (primitiveType: PrimitiveType): string => primitiveType,
    },
    query: vi.fn(() => Promise.resolve([])),
    stream: vi.fn(),
    catalogs: vi.fn(() => Promise.resolve([])),
    schemas: vi.fn(() => Promise.resolve([])),
    tables: vi.fn(() => Promise.resolve([])),
    views: vi.fn(() => Promise.resolve([])),
    columns: vi.fn(() => Promise.resolve([])),
    createTable: vi.fn(() => Promise.resolve()),
    dropTable: vi.fn(() => Promise.resolve()),
    qualifiedTableName: vi.fn(() => "catalog.schema.table"),
    close: vi.fn(() => Promise.resolve()),
    ...overrides,
  } as unknown as DataSource
}

/**
 * Builds a fake {@link ResolvedDataSource} as returned by `resolveDataSource`,
 * so command tests can mock `@/resolve-datasource` without a live config.
 */
export function makeResolvedDataSource(
  options: {
    name?: string
    adapter?: string
    connection?: Record<string, unknown>
    dataSource?: DataSource
  } = {}
): ResolvedDataSource {
  const adapter = options.adapter ?? "trino"
  return {
    name: options.name ?? "default",
    instance: options.dataSource ?? makeStubDataSource({ adapter }),
    config: {
      adapter,
      connection: options.connection ?? {},
    },
  } as ResolvedDataSource
}
