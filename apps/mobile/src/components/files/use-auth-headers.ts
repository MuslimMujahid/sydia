import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/services/api/api";

/**
 * Session headers for native image requests (expo-image cannot use the Axios
 * interceptor). Null until the cookie is read from secure storage.
 */
export function useAuthHeaders(): Record<string, string> | null {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let active = true;

    authHeaders()
      .then((value) => {
        if (active) setHeaders(value);
      })
      .catch((error: unknown) => {
        console.warn(
          "Session headers for file previews could not be read",
          error
        );
        // Previews then fall back to their type icon; nothing else depends on this.
        if (active) setHeaders({});
      });

    return () => {
      active = false;
    };
  }, []);

  return headers;
}
