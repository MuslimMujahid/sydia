import { Image } from "expo-image";
import { FileImage, FileText, Music2 } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { FolderGlyph } from "@/components/ui/glyphs";
import { Text } from "@/components/ui/text";
import { getDocumentContentUrl } from "@/lib/services/api/documents/documents.api";
import { colors } from "@/lib/theme";
import { fileExtension } from "./file-format";

interface FileThumbnailProps {
  kind: "file" | "folder";
  id: string;
  name: string;
  fileKind: string | null;
  /** Session headers; null while they load (the type tile shows meanwhile). */
  headers: Record<string, string> | null;
  size?: number;
}

/**
 * Folder glyph, image preview, or a type tile with the file's extension.
 * Image previews load with the session cookie and fall back to the tile.
 */
export function FileThumbnail({
  kind,
  id,
  name,
  fileKind,
  headers,
  size = 44,
}: FileThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const box = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.27),
  };

  if (kind === "folder")
    return (
      <View style={[styles.tile, styles.folder, box]}>
        <FolderGlyph hue="coral" size={Math.round(size * 0.55)} />
      </View>
    );

  const Icon =
    fileKind === "audio" ? Music2 : fileKind === "image" ? FileImage : FileText;
  const extension = fileExtension(name);
  const tile = (
    <View style={[styles.tile, box]}>
      <Icon
        size={Math.round(size * 0.4)}
        color={colors.mutedForeground}
        strokeWidth={1.75}
      />
      {extension && size >= 40 ? (
        <Text variant="mono" style={styles.extension} numberOfLines={1}>
          {extension}
        </Text>
      ) : null}
    </View>
  );

  if (fileKind !== "image" || failed || !headers) return tile;

  return (
    <View style={box}>
      {tile}
      <Image
        source={{ uri: getDocumentContentUrl(id), headers }}
        style={[StyleSheet.absoluteFill, box]}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={id}
        transition={120}
        accessibilityIgnoresInvertColors
        onError={(event) => {
          console.warn("File thumbnail unavailable", {
            documentId: id,
            error: event.error,
          });
          setFailed(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  folder: { backgroundColor: colors.card },
  extension: { fontSize: 8, lineHeight: 10, color: colors.mutedForeground },
});
