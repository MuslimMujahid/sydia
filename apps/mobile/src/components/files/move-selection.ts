import { z } from "zod";
import type { LibraryRef } from "@/lib/services/api/file-library/file-library.api";

const moveSelectionSchema = z
  .array(
    z.object({
      kind: z.enum(["file", "folder"]),
      id: z.string().min(1).max(128),
      revision: z.number().int().min(1),
    })
  )
  .min(1)
  .max(1000);

export type MoveSelection = { ok: true; items: LibraryRef[] } | { ok: false };

/** Reads the route's selection snapshot without coercing a stale revision. */
export function readMoveSelection(param: string | undefined): MoveSelection {
  if (!param) return { ok: false };

  try {
    const value: unknown = JSON.parse(param);
    const result = moveSelectionSchema.safeParse(value);
    if (result.success) return { ok: true, items: result.data };
    console.warn("File move route was opened with an invalid selection");

    return { ok: false };
  } catch (error) {
    console.warn("File move selection could not be decoded", {
      name: error instanceof Error ? error.name : "UnknownError",
    });

    return { ok: false };
  }
}
