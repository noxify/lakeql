---
packages:
  "@lakeql/cli":
    type: patch
---

### Generated write mutations now accept and insert a batch of records

Generated create-mutations now take an array input (`[<Model>Input!]!`) and write every record through the adapter's write strategy. Previously the mutation argument was a single input object, so the write path received a non-array value, ran zero inserts, and no rows were written (the table could still be auto-created). The validation path now validates each record in the batch. To write a single row, pass a one-element array.
