import { shouldShow } from "./notify-level";
import { getSetting, type ToastPosition, useSetting } from "./settings";
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

/** Clear of the player bar and the selection bar over it; on the right also clear of the "up next" card. */
function offsetFor(position: ToastPosition, upNext: boolean): number | { bottom: number; right?: number; left?: number } {
  if (position.startsWith("top")) return 64;
  if (position === "bottom-right") return { bottom: upNext ? 184 : 128, right: 16 };
  if (position === "bottom-left") return { bottom: 128, left: 16 };
  return 128;
}

function ThemedToaster({ Toaster }: { Toaster: typeof import("@/components/ui/sonner").Toaster }) {
  const theme = useTheme();
  const position = useSetting("toastPosition");
  const upNext = useSetting("upNext");
  const resolved = theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
  return <Toaster theme={resolved} position={position} offset={offsetFor(position, upNext)} />;
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

/** A sample toast for the settings page, shown whatever the level so you can see where they land. */
export function previewNotice(message: string): void {
  ready ??= mount();
  void ready.then(({ toast }) => toast(message, { id: "notifications-preview" }));
}
