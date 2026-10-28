import { Button } from "@lodesong/ui/components/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@lodesong/ui/components/empty";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
  stack: string;
}

/** One per page (keyed by path): a broken page says so with a way out, and the rest of the app keeps working. */
export class RouteBoundary extends Component<{ path: string; children: ReactNode }, State> {
  state: State = { error: null, stack: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ stack: info.componentStack ?? "" });
    console.error(error);
  }

  render(): ReactNode {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    const details = [
      `page: ${this.props.path}`,
      `error: ${error.message}`,
      `browser: ${navigator.userAgent}`,
      error.stack ?? "",
      stack.trim(),
    ].join("\n");
    return (
      <Empty className="min-h-[50vh]">
        <EmptyHeader>
          <EmptyTitle className="font-mono">something broke on this page</EmptyTitle>
          <EmptyDescription className="font-mono text-xs">{error.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          <Button size="sm" onClick={() => window.location.reload()}>
            reload
          </Button>
          <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(details)}>
            copy details
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
}
