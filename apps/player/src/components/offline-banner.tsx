import { Alert, AlertAction, AlertDescription, AlertTitle } from "@lodesong/ui/components/alert";
import { Button } from "@lodesong/ui/components/button";
import { WifiOffIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { retryNow, useReachability } from "@/lib/reachability";

/** Floats over the page (no layout shift) while the server doesn't answer; retries itself, or now on demand. */
export function OfflineBanner() {
  const { unreachable, retryAt } = useReachability();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!unreachable) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [unreachable]);
  if (!unreachable) return null;
  const seconds = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;
  return (
    <Alert role="status" className="fixed top-2 left-1/2 z-40 w-auto max-w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 shadow-md">
      <WifiOffIcon />
      <AlertTitle className="font-mono">server unreachable</AlertTitle>
      <AlertDescription className="font-mono text-xs">
        playing from cache · trying again {seconds ? `in ${seconds} s` : "now"}
      </AlertDescription>
      <AlertAction>
        <Button size="xs" variant="outline" onClick={() => void retryNow()}>
          retry
        </Button>
      </AlertAction>
    </Alert>
  );
}
