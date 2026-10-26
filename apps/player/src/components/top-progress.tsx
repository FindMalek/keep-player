import { Progress } from "@keep/ui/components/progress";

/** The thin line at the very top while a refresh runs; indeterminate, styled in app.css. */
export function TopProgressLine() {
  return (
    <div className="top-progress fixed inset-x-0 top-0 z-50">
      <Progress value={null} aria-label="refreshing" className="gap-0" />
    </div>
  );
}
