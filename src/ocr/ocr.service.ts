import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createWorker } from 'tesseract.js';

const AMOUNT_PATTERNS = [
  /(?:TOTAL\s*GERAL|TOTAL\s*A\s*PAGAR|VALOR\s*TOTAL|TOTAL)[:\s]*R?\$?\s*([\d]{1,3}(?:[.\d]{3})*,\d{2})/im,
  /R\$\s*([\d.,]+)(?:\s*$|\s*\n)/m,
];

const CNPJ_PATTERN = /(?:CNPJ)[:\s]*(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})/i;
const DATE_PATTERN = /(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/;

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processImage(
    tenantId: string,
    imageBuffer: Buffer,
    mimeType: string,
    filename: string,
  ) {
    // Salva o documento
    const doc = await this.prisma.document.create({
      data: { tenantId, filename, mimeType, storagePath: `uploads/${tenantId}/${filename}`, status: 'PROCESSING' },
    });

    try {
      // OCR com Tesseract
      const worker = await createWorker(['por', 'eng']);
      const { data } = await worker.recognize(imageBuffer);
      await worker.terminate();

      const rawText = data.text ?? '';
      const confidence = data.confidence ?? 0;

      // Parse dos campos
      const extracted = {
        rawText,
        confidence,
        amount:   this.parseAmount(rawText),
        date:     this.parseDate(rawText),
        merchant: this.parseMerchant(rawText),
        cnpj:     this.parseCnpj(rawText),
      };

      // Atualiza documento
      await this.prisma.document.update({
        where: { id: doc.id },
        data: {
          status: 'DONE',
          ocrText: rawText,
          ocrData: extracted,
        },
      });

      return { documentId: doc.id, ...extracted };

    } catch (err) {
      this.logger.error(`OCR falhou: ${err}`);
      await this.prisma.document.update({
        where: { id: doc.id },
        data: { status: 'FAILED', errorMessage: String(err) },
      });
      throw err;
    }
  }

  getHistory(tenantId: string) {
    return this.prisma.document.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, filename: true, status: true, ocrData: true, createdAt: true },
    });
  }

  private parseAmount(text: string): number | undefined {
    for (const p of AMOUNT_PATTERNS) {
      const m = text.match(p);
      if (!m) continue;
      const val = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(val) && val > 0 && val < 9_999_999) return Math.round(val * 100) / 100;
    }
  }

  private parseDate(text: string): string | undefined {
    const m = text.match(DATE_PATTERN);
    if (!m) return undefined;
    const d = new Date(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
    return isNaN(d.getTime()) ? undefined : d.toISOString().split('T')[0];
  }

  private parseMerchant(text: string): string | undefined {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3 && !/^\d/.test(l) && !/CNPJ|CPF|NOTA/i.test(l));
    return lines[0]?.substring(0, 100);
  }

  private parseCnpj(text: string): string | undefined {
    const m = text.match(CNPJ_PATTERN);
    return m ? m[1].replace(/[^\d]/g, '').substring(0, 14) : undefined;
  }
}