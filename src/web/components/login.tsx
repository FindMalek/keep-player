import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { login } from "@/lib/subsonic";
import { BrandMark } from "./brand";

export function Login() {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(user.trim(), password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="fixed inset-0 grid place-items-center p-4">
      <Card className="w-full max-w-80">
        <CardHeader>
          <CardTitle>
            <BrandMark />
          </CardTitle>
          <CardDescription>sign in with your navidrome account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="user" className="font-mono text-muted-foreground">
                  username
                </FieldLabel>
                <Input
                  id="user"
                  autoComplete="username"
                  value={user}
                  onChange={(event) => setUser(event.target.value)}
                  required
                  autoFocus
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password" className="font-mono text-muted-foreground">
                  password
                </FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </Field>
              {error && <FieldError>{error}</FieldError>}
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? "signing in…" : "sign in"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
