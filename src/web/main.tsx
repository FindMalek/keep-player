import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { registerServiceWorker } from "./lib/offline";
import { CACHE_MAX_AGE, CACHE_VERSION, persister, queryClient, shouldPersist } from "./lib/queries";

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        buster: CACHE_VERSION,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
      }}
    >
      <App />
    </PersistQueryClientProvider>,
  );

registerServiceWorker();
