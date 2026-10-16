import { shouldShow } from "./notify-level";
import { getSetting } from "./settings";
import { useTheme } from "./theme";

export interface Notice {
  message: string;
  kind?: "info" | "error";
  action?: { label: string; onClick: () => void };
  /** A second button ("keep mine"). */
  cancel?: { label: string; onClick: () => void };
  /** How long it stays, ms (sonner's default otherwise). */
  duration?: number;
  /** A toast with the same id replaces the one showing (a newer offer of the same kind). */
  id?: string;
}

type Sonner = typeof import("sonner");
let ready: Promise<Sonner> | null = null;

function ThemedToaster({ Toaster }: { Toaster: typeof import("@/components/ui/sonner").Toaster }) {
  const theme = useTheme();
  const resolved = theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
  // Above the player bar and the selection bar that floats over it, so a toast never covers its buttons.
  return <Toaster theme={resolved} position="bottom-center" offset={128} />;
}

/** Toasts load on first use (sonner stays out of the first screen) in their own small React root. */
async function mount(): Promise<Sonner> {
  const [{ createRoot }, { Toaster }, sonner] = await Promise.all([
    import("react-dom/client"),
    import("@/components/ui/sonner"),
    import("sonner"),
  ]);
  const host = document.createElement("div");
  document.body.append(host);
  createRoot(host).render(<ThemedToaster Toaster={Toaster} />);
  // Give the toaster a frame to subscribe before the first toast.
  await new Promise((resolve) => requestAnimationFrame(resolve));
  return sonner;
}

export function notify({ message, kind = "info", action, cancel, duration, id }: Notice): void {
  if (!shouldShow(getSetting("toasts"), { kind, action, cancel })) return;
  ready ??= mount();
  void ready.then(({ toast }) => (kind === "error" ? toast.error : toast)(message, { action, cancel, duration, id }));
}
