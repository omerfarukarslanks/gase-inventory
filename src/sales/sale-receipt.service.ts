import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

export interface ReceiptLineItem {
  name: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  discountAmount?: number | null;
  taxAmount?: number | null;
}

export interface ReceiptData {
  receiptNo: string;
  storeName: string;
  storeAddress?: string | null;
  createdAt: Date;
  customerName?: string | null;
  customerPhone?: string | null;
  lines: ReceiptLineItem[];
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  currency: string;
  paymentStatus: string;
}

@Injectable()
export class SaleReceiptService {
  /**
   * Satış fişi için PDF buffer üretir.
   */
  generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: [226, 600], margin: 10, autoFirstPage: true });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = 206; // usable width (226 - 2*10 margin)
      const right = (text: string, y: number) => {
        doc.text(text, 10, y, { width: W, align: 'right' });
      };
      const center = (text: string, y: number, opts?: PDFKit.Mixins.TextOptions) => {
        doc.text(text, 10, y, { width: W, align: 'center', ...opts });
      };
      const line = (y: number) => {
        doc.moveTo(10, y).lineTo(216, y).strokeColor('#cccccc').stroke();
      };

      let y = 10;

      // Başlık
      doc.fontSize(13).font('Helvetica-Bold');
      center(data.storeName, y);
      y += 18;

      if (data.storeAddress) {
        doc.fontSize(8).font('Helvetica');
        center(data.storeAddress, y);
        y += 12;
      }

      line(y); y += 6;

      // Fiş bilgisi
      doc.fontSize(8).font('Helvetica');
      doc.text(`Fiş No : ${data.receiptNo}`, 10, y);
      y += 11;
      doc.text(`Tarih   : ${data.createdAt.toLocaleString('tr-TR')}`, 10, y);
      y += 11;

      if (data.customerName) {
        doc.text(`Müşteri : ${data.customerName}`, 10, y);
        y += 11;
      }
      if (data.customerPhone) {
        doc.text(`Tel     : ${data.customerPhone}`, 10, y);
        y += 11;
      }

      line(y); y += 6;

      // Sütun başlıkları
      doc.fontSize(7.5).font('Helvetica-Bold');
      doc.text('Ürün', 10, y, { width: 110 });
      doc.text('Adet', 120, y, { width: 25, align: 'right' });
      doc.text('Birim', 145, y, { width: 28, align: 'right' });
      doc.text('Tutar', 173, y, { width: 43, align: 'right' });
      y += 12;
      line(y); y += 5;

      // Satırlar
      doc.fontSize(7.5).font('Helvetica');
      for (const item of data.lines) {
        const nameLines = Math.ceil(item.name.length / 20);
        doc.text(item.name, 10, y, { width: 108, ellipsis: true });
        doc.text(String(item.quantity), 120, y, { width: 25, align: 'right' });
        doc.text(this.fmt(item.unitPrice, data.currency), 145, y, { width: 28, align: 'right' });
        doc.text(this.fmt(item.lineTotal, data.currency), 173, y, { width: 43, align: 'right' });
        y += nameLines > 1 ? 18 : 12;

        if (y > doc.page.height - 80) {
          doc.addPage({ size: [226, 600], margin: 10 });
          y = 10;
        }
      }

      line(y); y += 6;

      // Toplamlar
      doc.fontSize(8).font('Helvetica');

      doc.text('Ara Toplam', 10, y, { width: 130 });
      right(this.fmt(data.subtotal, data.currency), y);
      y += 12;

      if (data.totalDiscount > 0) {
        doc.text('İndirim', 10, y, { width: 130 });
        right(`-${this.fmt(data.totalDiscount, data.currency)}`, y);
        y += 12;
      }

      if (data.totalTax > 0) {
        doc.text('KDV', 10, y, { width: 130 });
        right(`+${this.fmt(data.totalTax, data.currency)}`, y);
        y += 12;
      }

      line(y); y += 4;
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('TOPLAM', 10, y, { width: 130 });
      right(this.fmt(data.grandTotal, data.currency), y);
      y += 14;

      doc.fontSize(8).font('Helvetica');
      doc.text('Ödenen', 10, y, { width: 130 });
      right(this.fmt(data.paidAmount, data.currency), y);
      y += 12;

      if (data.remainingAmount > 0) {
        doc.text('Kalan Borç', 10, y, { width: 130 });
        right(this.fmt(data.remainingAmount, data.currency), y);
        y += 12;
      }

      line(y); y += 8;
      doc.fontSize(7).font('Helvetica');
      center('Teşekkür ederiz!', y);

      doc.end();
    });
  }

  private fmt(value: number | null | undefined, currency: string): string {
    const n = Number(value ?? 0);
    return `${n.toFixed(2)} ${currency}`;
  }
}
