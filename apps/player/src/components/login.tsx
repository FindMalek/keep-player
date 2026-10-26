import { Button } from "@keep/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@keep/ui/components/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@keep/ui/components/field";
import { Input } from "@keep/ui/components/input";
import { Skeleton } from "@keep/ui/components/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@keep/ui/components/toggle-group";
import { CheckIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { login } from "@/lib/subsonic";
import { BrandMark } from "./brand";

/** What `/api/health` says about each server this instance may sign in to (never their addresses). */
interface ServerHealth {
  id: string;
  reachable: boolean;
  latencyMs: number | null;
  server: string | null;
  openSubsonic: boolean;
}

const DOCS = "https://github.com/FindMalek/keep-player/blob/main/docs/deploy/README.md";

/**
 * Sign-in, with the server check up front: which Navidrome this instance talks to, whether it answers, and what to fix
 * when it doesn't, so a broken setup reads as a setup problem rather than a wrong password.
 */
export function Login() {
  const [servers, setServers] = useState<ServerHealth[] | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [server, setServer] = useState<string | null>(null);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setCheckFailed(false);
    const response = await fetch("/api/health", { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { upstreams?: ServerHealth[] } | null;
    if (!body?.upstreams) return setCheckFailed(true);
    setServers(body.upstreams);
    setServer((current) => current ?? body.upstreams?.find((item) => item.reachable)?.id ?? body.upstreams?.[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(user.trim(), password, server ?? undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "login failed");
      // A failure may be the server going away: show its state again.
      void check();
    } finally {
      setBusy(false);
    }
  }

  const selected = servers?.find((item) => item.id === server);
  return (
    <main className="fixed inset-0 grid place-items-center p-4">
      <Card className="w-full max-w-88">
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
                <FieldLabel className="font-mono text-muted-foreground">server</FieldLabel>
                {servers && servers.length > 1 && (
                  <ToggleGroup
                    aria-label="server"
                    variant="outline"
                    size="sm"
                    value={server ? [server] : []}
                    onValueChange={(value) => value[0] && setServer(value[0])}
                  >
                    {servers.map((item) => (
                      <ToggleGroupItem key={item.id} value={item.id} className="font-mono">
                        {item.id}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
                <ServerStatus
                  health={selected ?? null}
                  loading={!servers && !checkFailed}
                  failed={checkFailed}
                  onRetry={() => void check()}
                />
              </Field>
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

function ServerStatus({
  health,
  loading,
  failed,
  onRetry,
}: {
  health: ServerHealth | null;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  if (loading) return <Skeleton className="h-5 w-48" />;
  if (failed || !health)
    return (
      <FieldDescription className="flex items-center gap-2">
        couldn't check the server
        <RetryButton onRetry={onRetry} />
      </FieldDescription>
    );
  if (!health.reachable)
    return (
      <div role="alert" className="flex flex-col gap-1 font-mono text-xs">
        <span className="flex items-center gap-1.5 text-destructive">
          <XIcon className="size-3.5" aria-hidden />
          can't reach {health.id === "default" ? "navidrome" : health.id}
          <RetryButton onRetry={onRetry} />
        </span>
        <span className="text-muted-foreground">
          check NAVIDROME_URL, and that both containers share a docker network.{" "}
          <a className="underline underline-offset-2 hover:text-foreground" href={DOCS} target="_blank" rel="noreferrer">
            setup guide
          </a>
        </span>
      </div>
    );
  return (
    <span className="flex items-center gap-1.5 font-mono text-muted-foreground text-xs" data-testid="server-status">
      <CheckIcon className="size-3.5 text-foreground" aria-hidden />
      {health.server ?? "subsonic server"} · {health.latencyMs} ms{health.openSubsonic ? " · opensubsonic" : ""}
    </span>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon-xs" aria-label="check again" onClick={onRetry}>
      <RefreshCwIcon />
    </Button>
  );
}
