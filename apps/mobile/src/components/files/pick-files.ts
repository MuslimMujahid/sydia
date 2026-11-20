import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { LocalUploadFile } from "@/lib/services/api/documents/documents.api";
import {
  cameraFileName,
  guessMimeType,
  normalizeUploadName,
} from "./file-format";

/** Thrown when the user has denied the camera; the caller offers Settings. */
export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

// HEIC photos are converted to JPEG, which every Sydia pipeline can read.
const PHOTO_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  quality: 0.85,
  exif: false,
  preferredAssetRepresentationMode:
    ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

function fromImageAsset(
  asset: ImagePicker.ImagePickerAsset,
  fallbackName: string
): LocalUploadFile {
  const mimeType =
    asset.mimeType ??
    (asset.fileName ? guessMimeType(asset.fileName) : null) ??
    "image/jpeg";

  return {
    uri: asset.uri,
    name: normalizeUploadName(asset.fileName ?? fallbackName, mimeType),
    mimeType,
    size: asset.fileSize ?? null,
  };
}

export async function takePhoto(): Promise<LocalUploadFile[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted)
    throw new PermissionDeniedError(
      "Izinkan Sydia memakai kamera di Pengaturan untuk memotret dokumen."
    );

  const result = await ImagePicker.launchCameraAsync(PHOTO_OPTIONS);
  if (result.canceled) return [];

  return result.assets.map((asset) =>
    fromImageAsset(asset, cameraFileName(new Date()))
  );
}

export async function pickPhotos(): Promise<LocalUploadFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    ...PHOTO_OPTIONS,
    allowsMultipleSelection: true,
    selectionLimit: 20,
    orderedSelection: true,
  });
  if (result.canceled) return [];

  const takenAt = new Date();

  return result.assets.map((asset, index) =>
    fromImageAsset(
      asset,
      cameraFileName(new Date(takenAt.getTime() + index * 1000))
    )
  );
}

/** Any file type; the backend validates formats and reports clear errors. */
export async function pickDocuments(): Promise<LocalUploadFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: "*/*",
  });
  if (result.canceled) return [];

  return result.assets.map((asset) => {
    const mimeType =
      asset.mimeType ?? guessMimeType(asset.name) ?? "application/octet-stream";

    return {
      uri: asset.uri,
      name: asset.name,
      mimeType,
      size: asset.size ?? null,
    };
  });
}
