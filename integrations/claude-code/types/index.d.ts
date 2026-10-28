/** What `GET /api/remote/now` answers. */
export type Now = {
  song: { id: string; title: string; artist?: string; album?: string; duration?: number } | null;
  position: number | null;
  playing: boolean;
  device: string | null;
  line: string | null;
  controllable: boolean;
};

declare module "claude-code" {
  interface PluginState {
    "lodesong-now-playing": { now: Now | null; error: string | null };
  }
}
