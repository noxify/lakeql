export const calculatePageInfo = ({
  totalCount,
  perPage,
  page,
}: {
  totalCount: number
  perPage: number
  page?: number
}) => {
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
