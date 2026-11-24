import React from "react";
import {
  checkExtensionMounts,
  getExtensionsState,
  loadExtensions,
  refreshCatalog,
  subscribeToExtensions,
} from "../lib/extensions";

export function useExtensionMounts() {
  const state = React.useSyncExternalStore(subscribeToExtensions, getExtensionsState);

  React.useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      if (!controller.signal.aborted) {
        timer = setTimeout(
          () => void checkExtensionMounts(controller.signal).finally(schedule),
          1500,
        );
      }
    };
    let catalogPending = false;
    const revalidate = async () => {
      if (document.hidden || catalogPending) return;
      catalogPending = true;
      try {
        await refreshCatalog(controller.signal);
      } finally {
        catalogPending = false;
      }
    };
    const catalogTimer = setInterval(revalidate, 5 * 60_000);
    window.addEventListener("focus", revalidate);
    void loadExtensions();
    schedule();
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearInterval(catalogTimer);
      window.removeEventListener("focus", revalidate);
    };
  }, []);

  return state;
}
