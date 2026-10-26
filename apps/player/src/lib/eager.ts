import { type ComponentType, createElement, use } from "react";

export type Eager<P> = ComponentType<P> & { preload: () => Promise<unknown> };

// Like React.lazy, but renders straight away once its chunk is in: no suspense, so no 300 ms reveal throttle.
export function eager<P extends object>(load: () => Promise<ComponentType<P>>): Eager<P> {
  let component: ComponentType<P> | undefined;
  let loading: Promise<ComponentType<P>> | undefined;
  const preload = () => {
    loading ??= load().then(
      (loaded) => {
        component = loaded;
        return loaded;
      },
      (error: unknown) => {
        loading = undefined;
        throw error;
      },
    );
    return loading;
  };
  function Eager(props: P) {
    return createElement(component ?? use(preload()), props);
  }
  return Object.assign(Eager, { preload });
}
