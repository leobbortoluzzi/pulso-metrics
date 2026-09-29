import { ArrowLeft, ArrowRight } from "lucide-react"

type PaginationProps = {
  page: number
  totalItems: number
  pageSize: number
  onChange: (page: number) => void
  label: string
}

export function Pagination({
  page,
  totalItems,
  pageSize,
  onChange,
  label,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  if (totalPages <= 1) return null

  return (
    <nav aria-label={`Paginação de ${label}`} className="pagination">
      <button
        aria-label="Página anterior"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        type="button"
      >
        <ArrowLeft size={15} />
      </button>
      <span aria-current="page" className="current-page">
        {page} / {totalPages}
      </span>
      <button
        aria-label="Próxima página"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        type="button"
      >
        <ArrowRight size={15} />
      </button>
    </nav>
  )
}
