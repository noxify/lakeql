/**
 * LakeQL Bug Reproduction - @lakeql/helpers
 *
 * This package provides utility functions for pagination, object manipulation,
 * and special character handling. Replace the code below with your reproduction.
 */

import { calculatePageInfo } from "@lakeql/helpers/calculate-page-info"
import { swap, isObject } from "@lakeql/helpers/object-helper"
import replaceSpecialCharacters from "@lakeql/helpers/special-characters"

// 1. Pagination calculation
const pageInfo = calculatePageInfo({
  totalCount: 250,
  perPage: 25,
  page: 3,
})
console.log("Page info:", pageInfo)
// {
//   currentPage: 3, maxPages: 10, hasNext: true, hasPrevious: true,
//   nextPage: 4, previousPage: 2, limit: 25, offset: 50, totalCount: 250
// }

// Edge cases
console.log(
  "First page:",
  calculatePageInfo({ totalCount: 100, perPage: 10, page: 1 })
)
console.log(
  "Last page:",
  calculatePageInfo({ totalCount: 100, perPage: 10, page: 10 })
)
console.log(
  "Empty:",
  calculatePageInfo({ totalCount: 0, perPage: 10, page: 1 })
)

// 2. Object swap (keys ↔ values)
const original = { graphqlName: "db_column", userName: "user_name" } as const
const swapped = swap(original)
console.log("Swapped:", swapped)
// { db_column: "graphqlName", user_name: "userName" }

// 3. isObject check
console.log("isObject({}):", isObject({}))
console.log("isObject([]):", isObject([]))
console.log("isObject('str'):", isObject("str"))

// 4. Special character replacement (Umlauts → ASCII)
console.log("Ärger →", replaceSpecialCharacters("Ärger")) // AErger
console.log("Größe →", replaceSpecialCharacters("Größe")) // Groesse
console.log("Überblick →", replaceSpecialCharacters("Überblick")) // UEberblick
console.log("Straße →", replaceSpecialCharacters("Straße")) // Strasse
