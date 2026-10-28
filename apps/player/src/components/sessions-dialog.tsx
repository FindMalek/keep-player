import { Button } from "@lodesong/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@lodesong/ui/components/dialog";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@lodesong/ui/components/item";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "./library";

interface SessionRow {
  id: string;
  created: number;
  seen: number;
  agent: string;
}

/** "Chrome on macOS" from a user agent; good enough to tell your devices apart. */
function device(agent: string): string {
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /Firefox\//.test(agent)
      ? "Firefox"
      : /Chrome\//.test(agent)
        ? "Chrome"
        : /Safari\//.test(agent)
          ? "Safari"
          : "browser";
  const os = /Mac OS X/.test(agent)
    ? "macOS"
    : /Windows/.test(agent)
      ? "Windows"
      : /Android/.test(agent)
        ? "Android"
        : /iPhone|iPad/.test(agent)
          ? "iOS"
          : /Linux/.test(agent)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

const when = (time: number) => new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Where this account is signed in, with a way to sign any other device out. */
export function SessionsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [data, setData] = useState<{ current: string; sessions: SessionRow[] } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/auth/sessions").catch(() => null);
    setData(response?.ok ? await response.json() : null);
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function revoke(id: string): Promise<void> {
    await fetch(`/auth/sessions/${id}`, { method: "DELETE", headers: { "x-lodesong": "1" } }).catch(() => undefined);
    await load();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">sessions</DialogTitle>
          <DialogDescription>devices signed in to this account. sessions end after 30 idle days.</DialogDescription>
        </DialogHeader>
        {!data ? (
          <EmptyState>loading…</EmptyState>
        ) : (
          <ItemGroup>
            {data.sessions.map((session) => (
              <Item key={session.id} variant="outline" size="sm">
                <ItemContent>
                  <ItemTitle>
                    {device(session.agent)}
                    {session.id === data.current && <span className="font-mono font-normal text-muted-foreground"> · this device</span>}
                  </ItemTitle>
                  <ItemDescription className="font-mono">last active {when(session.seen)}</ItemDescription>
                </ItemContent>
                {session.id !== data.current && (
                  <ItemActions>
                    <Button variant="outline" size="sm" onClick={() => void revoke(session.id)}>
                      sign out
                    </Button>
                  </ItemActions>
                )}
              </Item>
            ))}
          </ItemGroup>
        )}
      </DialogContent>
    </Dialog>
  );
}
