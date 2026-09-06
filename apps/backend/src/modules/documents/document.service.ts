import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
type UploadedFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };
import { DOCUMENT_REPOSITORY, type IDocumentRepository } from '../../database/interfaces';
import { PDFParse } from 'pdf-parse';
import type { Document, FileAsset, FileKind } from '../../database/entities';
import { EmbeddingsService } from '../../infra/embeddings';
import { OpenRouterMediaService } from '../../infra/model-gateway';
import { StorageService } from '../../infra/storage';

const CHUNK_SIZE = 1400;
const CHUNK_OVERLAP = 180;
function kindFor(mimeType: string): FileKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}
export function chunkText(content: string): string[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += CHUNK_SIZE - CHUNK_OVERLAP) chunks.push(normalized.slice(start, start + CHUNK_SIZE));
  return chunks;
}
@Injectable()
export class DocumentService {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: IDocumentRepository,
    private readonly storage: StorageService,
    private readonly embeddings: EmbeddingsService,
    private readonly media: OpenRouterMediaService,
  ) {}
  async ingest(userId: string, file: UploadedFile): Promise<Document> {
    const kind = kindFor(file.mimetype);
    const storageKey = `${userId}/${randomUUID()}`;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.put(storageKey, file.buffer, file.mimetype);
    let asset: FileAsset;
    let document: Document;
    try {
      asset = await this.documents.createFile(userId, { originalName: file.originalname, mimeType: file.mimetype, size: file.size, checksum, storageKey, kind });
      document = await this.documents.create(userId, { fileAssetId: asset.id, title: file.originalname });
    } catch (error: unknown) {
      await this.storage.delete(storageKey).catch(() => {});
      throw error;
    }
    try {
      let textContent: string | null = null;
      let transcript: string | null = null;
      let imageDescription: string | null = null;
      if (kind === 'audio') transcript = await this.media.transcribe(file.buffer, file.originalname, file.mimetype);
      else if (kind === 'image') imageDescription = await this.media.describeImage(file.buffer, file.mimetype);
      else textContent = await this.parseDocument(file);
      const searchable = textContent ?? transcript ?? imageDescription ?? '';
      const chunks = await this.documents.replaceChunks(document.id, userId, chunkText(searchable).map((content, chunkIndex) => ({ chunkIndex, content })));
      await Promise.all(chunks.map(async (chunk) => { const embedding = await this.embeddings.embed(chunk.content); if (embedding) await this.documents.setChunkEmbedding(chunk.id, embedding, this.embeddings.modelName(), this.embeddings.version); }));
      const structuredData = this.extractStructured(searchable);
      await this.documents.complete(document.id, { textContent, transcript, imageDescription, structuredData });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pemrosesan file gagal.';
      await this.documents.fail(document.id, message);
    }
    return (await this.documents.findById(userId, document.id, true))!;
  }
  async search(userId: string, query: string, limit = 6) {
    const keyword = await this.documents.searchKeyword(userId, query, limit);
    try {
      const embedding = await this.embeddings.embed(query);
      if (!embedding) return keyword;
      const semantic = await this.documents.searchVector(userId, embedding, limit);
      return [...keyword, ...semantic.filter((candidate) => !keyword.some((item) => item.id === candidate.id))].slice(0, limit);
    } catch {
      return keyword;
    }
  }
  private async parseDocument(file: UploadedFile): Promise<string> {
    if (file.mimetype === 'application/pdf') {
      const parser = new PDFParse({ data: file.buffer });
      try { return (await parser.getText()).text; } finally { await parser.destroy(); }
    }
    if (file.mimetype.startsWith('text/') || file.mimetype === 'application/json') return file.buffer.toString('utf8');
    throw new Error('Format dokumen belum didukung. Gunakan PDF, teks, JSON, gambar, atau audio.');
  }
  private extractStructured(content: string): Record<string, string> | null {
    const values: Record<string, string> = {};
    const email = content.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];
    const amount = content.match(/(?:Rp\.?\s?|IDR\s?)[\d.,]+/i)?.[0];
    const date = content.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/)?.[0];
    if (email) values.email = email;
    if (amount) values.amount = amount;
    if (date) values.date = date;
    return Object.keys(values).length ? values : null;
  }
}
