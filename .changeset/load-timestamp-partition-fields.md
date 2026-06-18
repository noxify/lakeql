---
"@lakeql/adapters": minor
---

Add `load_timestamp_year` and `load_timestamp_month` as materialized partition fields. When timestamp partitioning is active, these integer fields are automatically injected alongside `load_timestamp` into every record and the JSON Schema. This enables direct filtering by year/month in tools that read Parquet files from S3 without Hive metastore awareness (e.g. Jupyter notebooks with PyArrow, Pandas, or DuckDB).
