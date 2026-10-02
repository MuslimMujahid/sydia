export function registerServiceWorker(): void {
  if (
    // Vite supplies this build constant; it is not a Turborepo environment input.
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    !import.meta.env.PROD ||
    !window.isSecureContext ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  void navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .catch((error: unknown) => {
      console.error("Unable to register the Sydia service worker", error);
    });
}
