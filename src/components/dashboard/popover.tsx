import { createPortal } from "react-dom"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

type PopoverProps = {
  label: string
  trigger: ReactNode
  triggerClassName?: string
  panelClassName?: string
  portal?: boolean
  children: (close: () => void) => ReactNode
}

export function Popover({
  label,
  trigger,
  triggerClassName = "",
  panelClassName = "",
  portal = false,
  children,
}: PopoverProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        root.current &&
        !root.current.contains(event.target) &&
        !panelRef.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !portal) return

    function positionPanel() {
      const triggerRect = triggerRef.current?.getBoundingClientRect()
      const panel = panelRef.current
      if (!triggerRect || !panel) return

      const panelRect = panel.getBoundingClientRect()
      const margin = 12
      let top = triggerRect.bottom + 8
      if (top + panelRect.height > window.innerHeight - margin)
        top = triggerRect.top - panelRect.height - 8
      top = Math.max(
        margin,
        Math.min(top, window.innerHeight - panelRect.height - margin)
      )
      const left = Math.max(
        margin,
        Math.min(
          triggerRect.right - panelRect.width,
          window.innerWidth - panelRect.width - margin
        )
      )
      panel.style.top = `${top}px`
      panel.style.left = `${left}px`
      panel.style.visibility = "visible"
    }

    positionPanel()
    window.addEventListener("resize", positionPanel)
    document.addEventListener("scroll", positionPanel, true)
    return () => {
      window.removeEventListener("resize", positionPanel)
      document.removeEventListener("scroll", positionPanel, true)
    }
  }, [open, portal])

  const close = () => setOpen(false)
  const panel = open ? (
    <div
      aria-label={label}
      className={`popover-panel ${panelClassName}`}
      ref={panelRef}
      role="dialog"
      style={
        portal
          ? {
              position: "fixed",
              top: 0,
              right: "auto",
              bottom: "auto",
              left: 0,
              maxHeight: "calc(100vh - 24px)",
              overflowY: "auto",
              visibility: "hidden",
            }
          : undefined
      }
    >
      {children(close)}
    </div>
  ) : null

  return (
    <div className="popover-root" ref={root}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className={triggerClassName}
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        {trigger}
      </button>
      {panel &&
        (portal && typeof document !== "undefined"
          ? createPortal(panel, document.body)
          : !portal && panel)}
    </div>
  )
}
