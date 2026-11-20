import * as Clipboard from "expo-clipboard";
import { createURL } from "expo-linking";
import { WEB_APP_URL } from "@/components/settings/app-flags";
import { noteWebLink } from "./workspace-model";

export async function copyWorkspaceNoteLink(ref: string) {
  const url = WEB_APP_URL
    ? noteWebLink(WEB_APP_URL, ref)
    : createURL(`note/${encodeURIComponent(ref)}`);
  if (!(await Clipboard.setStringAsync(url))) {
    throw new Error("Tautan tidak dapat disalin ke papan klip.");
  }
}
