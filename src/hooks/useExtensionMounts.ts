import React from "react";
import {
  checkExtensionMounts,
  getExtensionsState,
  loadExtensions,
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
    void loadExtensions();
    schedule();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  return state;
}
