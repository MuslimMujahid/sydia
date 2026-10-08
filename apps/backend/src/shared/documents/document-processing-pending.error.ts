/** The channel wait ended; the independently queued document job remains active. */
export class DocumentProcessingPendingError extends Error {
  constructor(readonly documentId: string) {
    super(
      'Pemrosesan dokumen melewati batas waktu tunggu dan masih berjalan di latar belakang. Periksa statusnya di perpustakaan file sebelum mengunggah ulang.',
    );
    this.name = 'DocumentProcessingPendingError';
  }
}
