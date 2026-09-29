import { useState } from "react"
import { CalendarDays, ChevronDown } from "lucide-react"
import { Popover } from "@/components/dashboard/popover"
import {
  dateRangeForDays,
  formatRange,
  type DateRange,
} from "@/components/dashboard/date-range-utils"

type DateRangeControlProps = {
  value: DateRange
  onApply: (value: DateRange) => void
  className?: string
}

export function DateRangeControl({
  value,
  onApply,
  className = "",
}: DateRangeControlProps) {
  return (
    <Popover
      label="Selecionar intervalo de datas"
      trigger={
        <>
          <CalendarDays size={15} />
          <span>{formatRange(value)}</span>
          <ChevronDown size={13} />
        </>
      }
      triggerClassName={`date-range-button ${className}`}
      panelClassName="date-range-panel"
    >
      {(close) => (
        <DateRangeForm
          value={value}
          onApply={(range) => {
            onApply(range)
            close()
          }}
        />
      )}
    </Popover>
  )
}

function DateRangeForm({
  value,
  onApply,
}: {
  value: DateRange
  onApply: (range: DateRange) => void
}) {
  const [from, setFrom] = useState(value.from)
  const [to, setTo] = useState(value.to)
  const valid = isValidRange(from, to)

  return (
    <form
      className="date-range-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid) onApply({ from, to })
      }}
    >
      <strong>Período personalizado</strong>
      <label>
        Data inicial
        <input
          max={to || undefined}
          onChange={(event) => setFrom(event.target.value)}
          required
          type="date"
          value={from}
        />
      </label>
      <label>
        Data final
        <input
          min={from || undefined}
          max={today()}
          onChange={(event) => setTo(event.target.value)}
          required
          type="date"
          value={to}
        />
      </label>
      <p aria-live="polite" className={valid ? "range-hint" : "range-error"}>
        {valid
          ? "Escolha um intervalo de até 90 dias."
          : "Informe datas válidas em um intervalo máximo de 90 dias."}
      </p>
      <button className="button button-primary" disabled={!valid} type="submit">
        Aplicar período
      </button>
    </form>
  )
}

function isValidRange(from: string, to: string) {
  if (!from || !to || from > to || to > today()) return false
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end - start <= 90 * 86_400_000
  )
}

function today() {
  return dateRangeForDays(1).to
}
