import { useSyncExternalStore, type ReactNode } from "react";

const subscribe = () => () => undefined;

// SSR controls must not accept passwords before React can intercept submission.
export function AuthInteractive({ children }: { children: ReactNode }) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  return (
    <fieldset
      disabled={!hydrated}
      aria-busy={!hydrated}
      className="m-0 min-w-0 border-0 p-0"
    >
      {children}
    </fieldset>
  );
}
