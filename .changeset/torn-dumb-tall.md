---
"@lakeql/cli": patch
---

Improve pull command UX for large table selections by switching to compact live output.

- for interactive pull with >10 tables selected: use compact live progress (`Completed X/Y | Active A/B`) instead of rendering one task line per table
- parallelizes table pulls with bounded concurrency (8 concurrent workers) to balance speed and resource usage
- displays active table names (up to 5) with `… +N more active` indicator when queue is large
- prevents terminal flooding for large schema pulls while maintaining visibility into active work
