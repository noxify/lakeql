/**
 * Parameters for calculatePageInfo.
 */
export interface CalculatePageInfoProps {
  /** The total number of records. */
  totalCount: number
  /** The number of records per page. */
  perPage: number
  /** The current page number (defaults to 1). */
  page?: number
}

/**
 * Calculates pagination metadata from total count and page params.
 */
export const calculatePageInfo = ({
  totalCount,
  perPage,
  page,
}: CalculatePageInfoProps) => {
  const maxPages = Math.ceil(totalCount / perPage)
  const currentPage = page ?? 1

  const hasPrevious = currentPage - 1 > 0
  const previousPage = hasPrevious ? currentPage - 1 : null

  const hasNext = currentPage < maxPages
  const nextPage = hasNext ? currentPage + 1 : null

  const limit = perPage
  const offset =
    currentPage > 1 ? Math.ceil(currentPage * perPage) - perPage : null

  return {
    currentPage,
    hasNext,
    hasPrevious,
    limit,
    maxPages,
    nextPage,
    offset,
    previousPage,
    totalCount,
  }
}
