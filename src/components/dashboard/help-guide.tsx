import { useEffect, useRef } from "react"
import { ArrowRight, CircleHelp, X } from "lucide-react"
import { Button } from "@/components/ui/button"

type HelpGuideProps = {
  onClose: () => void
  onOpenIntegrations: () => void
}

export function HelpGuide({ onClose, onOpenIntegrations }: HelpGuideProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <div
      className="modal-scrim help-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="presentation"
    >
      <section
        aria-labelledby="help-guide-title"
        aria-modal="true"
        className="help-guide-dialog"
        role="dialog"
      >
        <div className="help-guide-heading">
          <span className="help-icon">
            <CircleHelp size={18} />
          </span>
          <button
            aria-label="Fechar ajuda"
            className="icon-button"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X size={17} />
          </button>
        </div>
        <div className="panel-kicker">GUIA RÁPIDO</div>
        <h2 id="help-guide-title">Conecte suas fontes de dados</h2>
        <ol className="help-guide-steps">
          <li>
            <strong>Configure o aplicativo Meta</strong>
            <span>Informe App ID e App Secret para liberar o OAuth.</span>
          </li>
          <li>
            <strong>Conecte suas contas de anúncio</strong>
            <span>Autorize o acesso Meta e selecione as contas que usa.</span>
          </li>
          <li>
            <strong>Conecte Hotmart e Kiwify</strong>
            <span>Salve credenciais e configure os tokens de webhook.</span>
          </li>
          <li>
            <strong>Atualize os dados</strong>
            <span>
              Use os botões de atualização para buscar vendas e anúncios.
            </span>
          </li>
        </ol>
        <div className="help-guide-actions">
          <Button
            className="dashboard-action dashboard-action-secondary"
            variant="outline"
            size="lg"
            onClick={onClose}
            type="button"
          >
            Fechar
          </Button>
          <Button
            className="dashboard-action"
            size="lg"
            onClick={onOpenIntegrations}
            type="button"
          >
            Abrir integrações <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </section>
    </div>
  )
}
