import { useState, type FormEvent } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function SecurityPage({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setError("")
    if (newPassword !== confirmPassword) {
      setError("As novas senhas não coincidem.")
      return
    }
    setSaving(true)
    try {
      const response = await fetch("/api/auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      })
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok)
        throw new Error(result.error || "Não foi possível alterar a senha.")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      onToast("Senha alterada. Sua sessão atual foi mantida.")
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar a senha."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> CONTA ADMINISTRATIVA
          </div>
          <h1>
            Segurança<span className="heading-period">.</span>
          </h1>
          <p>Gerencie a senha de acesso ao seu dashboard.</p>
        </div>
      </div>
      <Card className="settings-panel security-settings" id="account-security">
        <CardHeader>
          <CardTitle>Alterar senha</CardTitle>
          <CardDescription>
            Confirme sua senha atual para escolher uma nova senha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword}>
            <FieldGroup>
              <Field data-disabled={saving}>
                <FieldLabel htmlFor="current-password">Senha atual</FieldLabel>
                <Input
                  id="current-password"
                  autoComplete="current-password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  required
                  disabled={saving}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </Field>
              <Field data-disabled={saving}>
                <FieldLabel htmlFor="new-password">Nova senha</FieldLabel>
                <Input
                  id="new-password"
                  autoComplete="new-password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  required
                  aria-describedby="new-password-help"
                  disabled={saving}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                <FieldDescription id="new-password-help">
                  Use de 12 a 128 caracteres.
                </FieldDescription>
              </Field>
              <Field data-disabled={saving}>
                <FieldLabel htmlFor="confirm-password">
                  Confirmar nova senha
                </FieldLabel>
                <Input
                  id="confirm-password"
                  autoComplete="new-password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  required
                  disabled={saving}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </Field>
              {error && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="settings-actions">
                <Button type="submit" disabled={saving} size="lg">
                  {saving ? "Alterando…" : "Alterar senha"}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </>
  )
}
