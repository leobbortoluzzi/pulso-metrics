import { useEffect, useRef } from "react"
import { Copy, X } from "lucide-react"
import type { Sale } from "@/lib/dashboard-data"

type SaleDetailsProps = {
  sale: Sale
  onClose: () => void
  onToast: (message: string) => void
}

export function SaleDetails({ sale, onClose, onToast }: SaleDetailsProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  async function copyId() {
    try {
      await navigator.clipboard.writeText(sale.id)
      onToast("ID da transação copiado.")
    } catch {
      onToast("Não foi possível copiar o ID desta transação.")
    }
  }

  return (
    <div
      className="modal-scrim details-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="presentation"
    >
      <section
        aria-labelledby="sale-details-title"
        aria-modal="true"
        className="sale-details-panel"
        role="dialog"
      >
        <div className="sale-details-heading">
          <div>
            <div className="panel-kicker">DETALHES DA TRANSAÇÃO</div>
            <h2 id="sale-details-title">{sale.id}</h2>
          </div>
          <button
            aria-label="Fechar detalhes"
            className="icon-button"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X size={17} />
          </button>
        </div>
        <dl className="sale-details-list">
          <div>
            <dt>Produto</dt>
            <dd>{sale.product}</dd>
          </div>
          <div>
            <dt>Gateway</dt>
            <dd>{sale.gateway}</dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>{sale.date}</dd>
          </div>
          <div>
            <dt>Valor</dt>
            <dd>{sale.amountLabel ?? formatBrl(sale.amount)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{sale.status}</dd>
          </div>
          <div>
            <dt>Atribuição</dt>
            <dd>{sale.matched ? sale.campaign : "Sem atribuição"}</dd>
          </div>
        </dl>
        <p className="sale-details-privacy">
          O Pulso não armazena dados pessoais do comprador nesta tela.
        </p>
        <button
          className="button button-secondary"
          onClick={() => void copyId()}
          type="button"
        >
          <Copy size={15} /> Copiar ID
        </button>
      </section>
    </div>
  )
}

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}
