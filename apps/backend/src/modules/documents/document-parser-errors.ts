export function documentParserFailureMessage(code: string): string {
  if (code === 'UNSUPPORTED_FORMAT' || code === 'UNSUPPORTED_EMBEDDED_IMAGE')
    return 'Format file belum didukung. Ekspor dokumen ke PDF, DOCX, XLSX, atau PPTX lalu unggah kembali.';
  if (/PASSWORD|ENCRYPTED/.test(code))
    return 'Dokumen dilindungi kata sandi. Unggah salinan tanpa kata sandi.';
  if (code === 'FORMAT_MISMATCH')
    return 'Isi file tidak sesuai dengan formatnya. Ekspor ulang dari aplikasi asal lalu unggah kembali.';
  if (code === 'CORRUPT_DOCUMENT' || code === 'INVALID_TEXT_ENCODING')
    return 'File rusak atau tidak dapat dibaca. Ekspor ulang sebagai PDF atau UTF-8 lalu unggah kembali.';
  if (code === 'EMPTY_DOCUMENT')
    return 'Tidak ada isi yang dapat diindeks. Unggah dokumen yang berisi teks atau gambar yang jelas.';
  if (code === 'VISION_UNREADABLE')
    return 'Isi gambar tidak dapat dibaca. Unggah hasil pindai atau gambar dengan teks dan diagram yang lebih jelas.';
  if (code === 'FILE_TOO_LARGE')
    return 'Ukuran file maksimal 100 MB. Perkecil file lalu unggah kembali.';
  if (code.startsWith('OCR_ASSETS_PREPARATION_'))
    return 'Layanan pembacaan dokumen sementara belum siap. Coba kembali sebentar lagi atau hubungi administrator.';
  if (/LIMIT_EXCEEDED|TIMEOUT/.test(code))
    return 'Dokumen melewati batas pemrosesan. Bagi dokumen menjadi file yang lebih kecil lalu unggah kembali.';
  if (code === 'VISION_NOT_CONFIGURED' || code === 'OCR_ASSETS_MISSING')
    return 'Layanan pembacaan gambar belum tersedia. Hubungi administrator atau unggah versi dokumen yang berisi teks.';

  return 'File tidak dapat diproses. Ekspor ulang dokumen lalu unggah kembali.';
}
