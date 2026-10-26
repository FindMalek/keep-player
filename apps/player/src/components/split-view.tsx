import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@keep/ui/components/resizable";
import type { ReactNode } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { PageSlot } from "./page-host";

/** Page plus the queue / lyrics panel, resizable, width remembered. Its own chunk: only loaded once a panel opens. */
export function SplitView({ host, side }: { host: HTMLDivElement; side: ReactNode }) {
  const layout = useDefaultLayout({ id: "keep-player:layout", panelIds: ["page", "side"], storage: localStorage });
  return (
    <ResizablePanelGroup orientation="horizontal" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged}>
      <ResizablePanel id="page" minSize="40%">
        <PageSlot host={host} />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="side" defaultSize={320} minSize={260} maxSize={560}>
        {side}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
