import { Progress } from "@/components/ui/progress";

/** The thin line at the very top while a refresh runs; indeterminate, styled in app.css. */
export function TopProgressLine() {
  return <Progress value={null} aria-label="refreshing" className="top-progress fixed inset-x-0 top-0 z-50 gap-0" />;
}
