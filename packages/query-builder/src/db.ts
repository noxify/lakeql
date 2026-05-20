import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely"

export const initDb = <T>() =>
  new Kysely<T>({
    dialect: {
      createAdapter() {
        return new PostgresAdapter()
      },
      createDriver() {
        return new DummyDriver()
      },
      createIntrospector(db: Kysely<T>) {
        return new PostgresIntrospector(db)
      },
      createQueryCompiler() {
        return new PostgresQueryCompiler()
      },
    },
  })
