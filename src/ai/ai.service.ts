import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ChatRequestDto } from './dto/chat.dto';
import { ToolService } from './tools/tool.service';
import { toolSystemPrompt } from './ai.prompts';
import { ToolCall, ToolName, ToolResult } from './tools/tool.type';
import { Readable } from 'stream';

@Injectable()
export class AiService {
  constructor(
    private readonly http: HttpService,
    private readonly tools: ToolService,
  ) {}

  private get baseUrl() {
    return process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  }

  private get model() {
    return process.env.OLLAMA_MODEL ?? 'llama3.2:3b';
  }

  private get requestTimeoutMs(): number {
    const raw = Number(process.env.OLLAMA_TIMEOUT_MS);
    if (!Number.isFinite(raw) || raw <= 0) {
      return 300_000;
    }
    return Math.trunc(raw);
  }

  private get numCtx(): number {
    const raw = Number(process.env.OLLAMA_NUM_CTX);
    if (!Number.isFinite(raw) || raw <= 0) {
      return 2048;
    }
    return Math.trunc(raw);
  }

  private normalizeBaseUrl(url: string): string {
    const trimmed = url.trim().replace(/\/+$/, '');
    // OLLAMA_BASE_URL "http://localhost:11434/api" gelirse /api/api/chat olmasin
    if (trimmed.endsWith('/api')) {
      return trimmed.slice(0, -4);
    }
    return trimmed;
  }

  private get chatUrl() {
    return `${this.normalizeBaseUrl(this.baseUrl)}/api/chat`;
  }

  private extractUpstreamErrorMessage(err: any): string | null {
    const data = err?.response?.data;
    if (!data) {
      return null;
    }
    if (typeof data === 'string') {
      return data;
    }
    if (typeof data?.error === 'string') {
      return data.error;
    }
    if (typeof data?.message === 'string') {
      return data.message;
    }
    return null;
  }

  private throwNormalizedOllamaError(err: any, url: string): never {
    const status = err?.response?.status;
    const upstreamMessage = this.extractUpstreamErrorMessage(err);

    if (status === 404) {
      const lower = (upstreamMessage ?? '').toLowerCase();
      if (lower.includes('model') && lower.includes('not found')) {
        throw new NotFoundException(
          `Ollama modeli bulunamadi: "${this.model}". Sunucuda "ollama pull ${this.model}" calistirin.`,
        );
      }
      throw new NotFoundException(
        `Ollama endpoint bulunamadi (${url}). OLLAMA_BASE_URL degerini kontrol edin.`,
      );
    }

    if (status && status >= 400) {
      throw new ServiceUnavailableException(
        `Ollama hatasi (${status}): ${upstreamMessage ?? 'upstream request failed'}`,
      );
    }

    if (err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND') {
      throw new ServiceUnavailableException(
        `Ollama servisi erisilemedi (baseUrl=${this.baseUrl}, model=${this.model}).`,
      );
    }

    if (err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT') {
      throw new ServiceUnavailableException(
        `Ollama timeout (timeoutMs=${this.requestTimeoutMs}, model=${this.model}, numCtx=${this.numCtx}).`,
      );
    }

    throw err;
  }

  async chatStream(body: ChatRequestDto): Promise<NodeJS.ReadableStream> {
    const url = this.chatUrl;

    const payload = {
      model: this.model,
      stream: true,
      messages: body.messages,
      options: {
        num_ctx: this.numCtx,
        temperature: 0.7,
        top_p: 0.9,
      },
    };

    try {
      const res = await firstValueFrom(
        this.http.post(url, payload, {
          responseType: 'stream',
          headers: { 'Content-Type': 'application/json' },
          timeout: this.requestTimeoutMs,
        }),
      );

      return res.data;
    } catch (err: any) {
      this.throwNormalizedOllamaError(err, url);
    }
  }

  async chatOnce(body: ChatRequestDto) {
    const url = this.chatUrl;

    const payload = {
      model: this.model,
      stream: false,
      messages: body.messages,
      options: {
        num_ctx: this.numCtx,
        temperature: 0.7,
        top_p: 0.9,
      },
    };

    try {
      const res = await firstValueFrom(
        this.http.post(url, payload, {
          timeout: this.requestTimeoutMs,
        }),
      );
      return res.data;
    } catch (err: any) {
      this.throwNormalizedOllamaError(err, url);
    }
  }

  private extractFirstJsonObject(input: string): string | null {
    const start = input.indexOf('{');
    if (start < 0) {
      return null;
    }

    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let i = start; i < input.length; i++) {
      const ch = input[i];

      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (ch === '\\') {
        isEscaped = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0) {
            return input.slice(start, i + 1);
          }
        }
      }
    }

    return null;
  }

  private getToolNames(): Set<ToolName> {
    return new Set<ToolName>([
      'search_products',
      'get_product_stock',
      'sales_summary',
      'store_performance',
      'stock_summary',
      'low_stock_alerts',
      'total_stock_quantity_report',
      'confirmed_orders_total_report',
      'returned_orders_total_report',
      'sales_by_product_report',
      'inventory_movements_summary',
      'sales_cancellations',
      'profit_margin_report',
      'revenue_trend_report',
      'tax_summary_report',
      'cogs_movement_report',
      'vat_summary_report',
      'audit_trail_report',
      'discount_summary_report',
      'employee_sales_performance_report',
      'employee_hourly_performance_report',
      'hourly_sales_report',
      'seasonality_report',
      'week_comparison_report',
      'product_performance_ranking_report',
      'dead_stock_report',
      'abc_analysis_report',
      'variant_comparison_report',
      'top_customers_report',
      'customer_purchase_history_report',
      'customer_frequency_report',
      'discount_effectiveness_report',
      'store_price_comparison_report',
      'sales_by_discount_band_report',
      'stock_turnover_report',
      'stock_aging_report',
      'reorder_analysis_report',
      'transfer_analysis_report',
      'transfer_balance_recommendation_report',
    ]);
  }

  private tryParseToolCall(text: string): ToolCall | null {
    const cleaned = text.replace(/```(?:json)?/gi, '').trim();
    const idx = cleaned.toUpperCase().indexOf('TOOL:');
    const candidate =
      idx >= 0
        ? cleaned.slice(idx + 'TOOL:'.length).trim()
        : cleaned;

    const json = this.extractFirstJsonObject(candidate);
    if (!json) {
      return null;
    }

    try {
      const obj = JSON.parse(json);
      const name = String(obj?.name ?? '') as ToolName;
      if (!this.getToolNames().has(name)) {
        return null;
      }
      const args =
        obj?.args && typeof obj.args === 'object' && !Array.isArray(obj.args)
          ? obj.args
          : {};
      return { name, args };
    } catch {
      return null;
    }
  }

  private getLastUserMessage(messages: any[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      const item = messages[i];
      if (item?.role === 'user' && typeof item?.content === 'string') {
        return item.content;
      }
    }
    return '';
  }

  private inferThresholdFromText(text: string): number | undefined {
    const byKeyword = text.match(/(?:esik|eşik)\s*(\d{1,3})/i);
    if (byKeyword?.[1]) {
      return Number(byKeyword[1]);
    }

    const firstNumber = text.match(/\b(\d{1,3})\b/);
    if (firstNumber?.[1]) {
      return Number(firstNumber[1]);
    }

    return undefined;
  }

  private extractProductReferenceFromText(text: string): string | undefined {
    const raw = text.trim();
    if (!raw) {
      return undefined;
    }

    const cleaned = raw.replace(/[?.!]+$/g, '').trim();
    const patterns = [
      /^(.+?)\s+ürünün?\s+stok/i,
      /^(.+?)\s+urun[unınin]*\s+stok/i,
      /^(.+?)\s+stok\s+durum/i,
      /^(.+?)\s+stok/i,
    ];

    let candidate: string | undefined;
    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match?.[1]) {
        candidate = match[1];
        break;
      }
    }

    if (!candidate) {
      return undefined;
    }

    const normalized = candidate
      .replace(
        /\b(bana|lütfen|lutfen|göster|goster|ver|getir|durumu|durumunu|raporu)\b/gi,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim();

    return normalized || undefined;
  }

  private normalizeToolCallByIntent(
    toolCall: ToolCall,
    userMessages: any[],
  ): ToolCall {
    const lastUserText = this.getLastUserMessage(userMessages).toLowerCase();
    const asksLowStock =
      /kritik.*stok|stok.*kritik|dusuk.*stok|stok.*dusuk|düşük.*stok|stok.*düşük/i.test(
        lastUserText,
      );

    if (asksLowStock && toolCall.name === 'stock_summary') {
      const inferred = this.inferThresholdFromText(lastUserText);
      const args = { ...(toolCall.args ?? {}) } as Record<string, any>;
      if (args.threshold == null && inferred != null) {
        args.threshold = inferred;
      }
      if (args.threshold == null) {
        args.threshold = 10;
      }
      return { name: 'low_stock_alerts', args };
    }

    return toolCall;
  }

  private inferToolCallFromUserMessage(userMessages: any[]): ToolCall | null {
    const rawText = this.getLastUserMessage(userMessages);
    const text = rawText.toLowerCase();
    if (!rawText) {
      return null;
    }

    if (
      /kritik.*stok|stok.*kritik|dusuk.*stok|stok.*dusuk|düşük.*stok|stok.*düşük|esik|eşik/i.test(
        text,
      )
    ) {
      return {
        name: 'low_stock_alerts',
        args: {
          threshold: this.inferThresholdFromText(text) ?? 10,
          page: 1,
          limit: 10,
        },
      };
    }

    if (/magaza.*performans|mağaza.*performans|store.*performans/i.test(text)) {
      return {
        name: 'store_performance',
        args: { page: 1, limit: 10 },
      };
    }

    if (/satis.*ozet|satış.*özet|ciro.*ozet|ciro.*özet/i.test(text)) {
      return { name: 'sales_summary', args: {} };
    }

    if (/ürün.*stok|urun.*stok|stok.*ürün|stok.*urun/i.test(text)) {
      const inferredProduct =
        this.extractProductReferenceFromText(rawText) ?? rawText;
      return {
        name: 'get_product_stock',
        args: { query: inferredProduct },
      };
    }

    if (/stok.*ozet|stok.*durum|stok.*rapor/i.test(text)) {
      return {
        name: 'stock_summary',
        args: { page: 1, limit: 10 },
      };
    }

    if (/iade.*siparis|iptal.*siparis|iptal.*satis/i.test(text)) {
      return { name: 'returned_orders_total_report', args: {} };
    }

    if (/confirmed.*siparis|onayli.*siparis|onaylı.*siparis/i.test(text)) {
      return { name: 'confirmed_orders_total_report', args: {} };
    }

    if (/kar.*marj|karlılık|karlilik|profit/i.test(text)) {
      return { name: 'profit_margin_report', args: { page: 1, limit: 10 } };
    }

    if (/en.*cok.*sat|en.*iyi.*urun|urun.*performans|ürün.*performans/i.test(text)) {
      return { name: 'product_performance_ranking_report', args: { page: 1, limit: 10 } };
    }

    if (/olu.*stok|ölü.*stok|dead.*stock|satilmayan|satılmayan/i.test(text)) {
      return { name: 'dead_stock_report', args: { noSaleDays: 30, page: 1, limit: 10 } };
    }

    if (/calisan.*performans|çalışan.*performans|personel.*performans/i.test(text)) {
      return { name: 'employee_sales_performance_report', args: { page: 1, limit: 10 } };
    }

    if (/en.*iyi.*musteri|müşteri.*siralama|müşteri.*sıralama|top.*musteri/i.test(text)) {
      return { name: 'top_customers_report', args: { page: 1, limit: 10 } };
    }

    if (/gelir.*trend|trend|revenue.*trend/i.test(text)) {
      return { name: 'revenue_trend_report', args: { groupBy: 'day' } };
    }

    if (/abc.*analiz|pareto/i.test(text)) {
      return { name: 'abc_analysis_report', args: {} };
    }

    if (/stok.*devir|turnover/i.test(text)) {
      return { name: 'stock_turnover_report', args: { page: 1, limit: 10 } };
    }

    if (/transfer.*denge|transfer.*oneri|dengesizlik/i.test(text)) {
      return { name: 'transfer_balance_recommendation_report', args: { page: 1, limit: 10 } };
    }

    if (/transfer.*analiz|magaza.*transfer|mağaza.*transfer/i.test(text)) {
      return { name: 'transfer_analysis_report', args: { page: 1, limit: 10 } };
    }

    if (/indirim.*etkisi|kampanya.*etkisi|kampanya.*analiz/i.test(text)) {
      return { name: 'discount_effectiveness_report', args: {} };
    }

    if (/kdv|vat|vergi.*ozet/i.test(text)) {
      return { name: 'vat_summary_report', args: {} };
    }

    if (/denetim|audit/i.test(text)) {
      return { name: 'audit_trail_report', args: { page: 1, limit: 20 } };
    }

    return null;
  }

  private ensureGetProductStockArgs(
    call: ToolCall,
    userMessages: any[],
  ): ToolCall {
    if (call.name !== 'get_product_stock') {
      return call;
    }

    const args = (call.args ?? {}) as Record<string, any>;
    const isPlaceholder = (value: unknown): boolean => {
      if (typeof value !== 'string') {
        return false;
      }
      const raw = value.trim().toLowerCase();
      if (!raw) {
        return true;
      }
      return (
        (raw.startsWith('<') && raw.endsWith('>')) ||
        raw.includes('uuid') ||
        raw.includes('placeholder') ||
        raw.includes('product_id') ||
        raw.includes('productid')
      );
    };

    const hasValidProductArg = [args.productId, args.productName, args.query, args.product]
      .some((value) => typeof value === 'string' && value.trim().length > 0 && !isPlaceholder(value));

    if (!args.__userQuery) {
      args.__userQuery = this.getLastUserMessage(userMessages);
    }

    if (hasValidProductArg) {
      return { ...call, args };
    }

    const lastUserText = this.getLastUserMessage(userMessages);
    const inferredProduct =
      this.extractProductReferenceFromText(lastUserText) ?? lastUserText;
    if (!inferredProduct.trim()) {
      return call;
    }

    return {
      ...call,
      args: {
        ...args,
        query: inferredProduct,
        __userQuery: lastUserText,
      },
    };
  }

  private toNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private formatScalar(value: unknown): string {
    if (value === null || value === undefined) {
      return '-';
    }

    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return String(parsed);
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '[object]';
      }
    }

    return String(value);
  }

  private formatObjectItems(obj: Record<string, any>): string {
    return Object.entries(obj)
      .slice(0, 8)
      .map(([key, value]) => `- ${key}: ${this.formatScalar(value)}`)
      .join('\n');
  }

  private formatGenericToolResult(result: ToolResult): string {
    const data = result.data as any;
    const rows = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data)
        ? data
        : [];

    if (rows.length > 0) {
      const preview = rows.slice(0, 8).map((item: any, idx: number) => {
        const name =
          item?.name ??
          item?.productName ??
          item?.variantName ??
          item?.storeName ??
          `kayit-${idx + 1}`;
        const value =
          item?.lineTotal ??
          item?.totalLineTotal ??
          item?.totalQuantity ??
          item?.quantity;
        if (value !== undefined) {
          return `${idx + 1}. ${name} - ${value}`;
        }
        return `${idx + 1}. ${name}`;
      });
      return `Rapor sonucu:\n${preview.join('\n')}`;
    }

    if (data?.totals && typeof data.totals === 'object') {
      return `Rapor ozeti:\n${this.formatObjectItems(data.totals)}`;
    }

    if (data && typeof data === 'object') {
      return `Rapor sonucu:\n${this.formatObjectItems(data)}`;
    }

    return 'Rapor sonucu alindi.';
  }

  private formatToolResultForUser(call: ToolCall, result: ToolResult): string {
    if (!result.ok) {
      return `Rapor verisi alinirken hata olustu: ${result.error ?? 'bilinmeyen hata'}`;
    }

    switch (call.name) {
      case 'low_stock_alerts': {
        const threshold = this.toNumber(call.args?.threshold, 10);
        const rows = Array.isArray((result.data as any)?.data)
          ? (result.data as any).data
          : [];

        if (rows.length === 0) {
          return `Esik ${threshold} icin kritik stokta urun bulunmuyor.`;
        }

        const top = rows.slice(0, 10);
        const lines = top.map(
          (row: any, idx: number) =>
            `${idx + 1}. ${row.productName} / ${row.variantName} - ${this.toNumber(
              row.quantity,
            )} adet (${row.storeName})`,
        );
        return `Esik ${threshold} icin kritik stokta ${rows.length} kayit bulundu:\n${lines.join('\n')}`;
      }

      case 'sales_summary': {
        const totals = (result.data as any)?.totals ?? {};
        return [
          'Satis ozeti:',
          `- Toplam fis: ${this.toNumber(totals.saleCount)}`,
          `- Confirmed: ${this.toNumber(totals.confirmedCount)}`,
          `- Iptal: ${this.toNumber(totals.cancelledCount)}`,
          `- Toplam tutar: ${this.toNumber(totals.totalLineTotal)}`,
          `- Ortalama sepet: ${this.toNumber(totals.averageBasket)}`,
        ].join('\n');
      }

      case 'store_performance': {
        const rows = Array.isArray((result.data as any)?.data)
          ? (result.data as any).data
          : [];
        if (rows.length === 0) {
          return 'Magaza performans verisi bulunamadi.';
        }
        const lines = rows.slice(0, 10).map(
          (row: any, idx: number) =>
            `${idx + 1}. ${row.storeName}: toplam ${this.toNumber(
              row.totalLineTotal,
            )}, confirmed ${this.toNumber(row.confirmedCount)}, iptal oranı ${this.toNumber(
              row.cancelRate,
            )}%`,
        );
        return `Magaza performans ozeti:\n${lines.join('\n')}`;
      }

      case 'stock_summary': {
        const rows = Array.isArray((result.data as any)?.data)
          ? (result.data as any).data
          : [];
        if (rows.length === 0) {
          return 'Stok ozeti icin kayit bulunamadi.';
        }
        const lines = rows.slice(0, 10).map(
          (row: any, idx: number) =>
            `${idx + 1}. ${row.productName} - toplam stok: ${this.toNumber(row.totalQuantity)}`,
        );
        return `Stok ozeti:\n${lines.join('\n')}`;
      }

      case 'search_products': {
        const rows = Array.isArray(result.data) ? result.data : [];
        if (rows.length === 0) {
          return 'Aradigin kriterde urun bulunamadi.';
        }
        const lines = rows.slice(0, 10).map(
          (row: any, idx: number) =>
            `${idx + 1}. ${row.name} (id: ${row.id}, sku: ${row.sku ?? '-'})`,
        );
        return `Bulunan urunler:\n${lines.join('\n')}`;
      }

      case 'get_product_stock': {
        const item = (result.data as any) ?? null;
        const meta = (result.meta as any) ?? {};
        if (!item) {
          const candidates = Array.isArray(meta.candidates)
            ? meta.candidates
            : [];
          if (candidates.length > 0) {
            const candidateLines = candidates
              .slice(0, 5)
              .map(
                (candidate: any, idx: number) =>
                  `${idx + 1}. ${candidate.name} (id: ${candidate.id})`,
              )
              .join('\n');
            return [
              `Bu urun icin stok verisi bulunamadi: ${meta.requested ?? '-'}`,
              'Bulunan benzer urunler:',
              candidateLines,
            ].join('\n');
          }
          return `Bu urun icin stok verisi bulunamadi: ${meta.requested ?? '-'}`;
        }
        const variantCount = Array.isArray(item.variants) ? item.variants.length : 0;
        return [
          `${item.productName} icin stok ozeti:`,
          `- Toplam stok: ${this.toNumber(item.totalQuantity)}`,
          `- Varyant sayisi: ${variantCount}`,
        ].join('\n');
      }

      case 'total_stock_quantity_report': {
        const totals = (result.data as any)?.totals ?? {};
        const comparison = (result.data as any)?.comparison ?? null;
        const base = comparison
          ? `\n- Degisim: ${this.toNumber(comparison.changePercent)}% (${comparison.trend})`
          : '';
        return `Toplam stok miktari: ${this.toNumber(totals.todayTotalQuantity)}${base}`;
      }

      case 'confirmed_orders_total_report':
      case 'returned_orders_total_report': {
        const totals = (result.data as any)?.totals ?? {};
        const label =
          call.name === 'confirmed_orders_total_report'
            ? 'Confirmed siparis ozeti'
            : 'Iade/iptal siparis ozeti';
        return [
          `${label}:`,
          `- Siparis adedi: ${this.toNumber(totals.orderCount)}`,
          `- Toplam unit price: ${this.toNumber(totals.totalUnitPrice)}`,
          `- Toplam line total: ${this.toNumber(totals.totalLineTotal)}`,
        ].join('\n');
      }

      case 'sales_by_product_report': {
        const rows = Array.isArray((result.data as any)?.data)
          ? (result.data as any).data
          : [];
        if (rows.length === 0) {
          return 'Urun bazli satis verisi bulunamadi.';
        }
        const lines = rows.slice(0, 10).map(
          (row: any, idx: number) =>
            `${idx + 1}. ${row.productName} / ${row.variantName}: adet ${this.toNumber(
              row.quantity,
            )}, ciro ${this.toNumber(row.lineTotal)}`,
        );
        return `Urun bazli satis performansi:\n${lines.join('\n')}`;
      }

      default:
        return this.formatGenericToolResult(result);
    }
  }

  private async chatOnceRaw(messages: any[], lowTemp = false) {
    const url = this.chatUrl;
    const payload = {
      model: this.model,
      stream: false,
      messages,
      options: {
        num_ctx: this.numCtx,
        temperature: lowTemp ? 0.3 : 0.7,
        top_p: lowTemp ? 0.8 : 0.9,
      },
    };

    try {
      const res = await firstValueFrom(
        this.http.post(url, payload, { timeout: this.requestTimeoutMs }),
      );
      return res.data;
    } catch (err: any) {
      this.throwNormalizedOllamaError(err, url);
    }
  }

  private buildSingleMessageStream(content: string): NodeJS.ReadableStream {
    const now = new Date().toISOString();
    const safeContent =
      content.trim() ||
      'Su anda uygun bir yanit olusturulamadi. Lutfen tekrar deneyin.';

    const chunk = JSON.stringify({
      model: this.model,
      created_at: now,
      message: { role: 'assistant', content: safeContent },
      done: false,
    });

    const done = JSON.stringify({
      model: this.model,
      created_at: now,
      message: { role: 'assistant', content: '' },
      done: true,
      done_reason: 'stop',
    });

    return Readable.from([`${chunk}\n`, `${done}\n`]);
  }

  async chatWithToolsStream(body: { messages: any[]; storeId?: string }) {
    const system = { role: 'system', content: toolSystemPrompt() };
    const initialMessages = [system, ...body.messages];

    // 1) Ilk cagrı (non-stream, düsük temp): tool gerekiyor mu?
    const first = await this.chatOnceRaw(initialMessages, true);
    const content = String(first?.message?.content ?? '');

    const parsed = this.tryParseToolCall(content);
    const normalized = parsed
      ? this.normalizeToolCallByIntent(parsed, body.messages)
      : null;
    const fallback = normalized ? null : this.inferToolCallFromUserMessage(body.messages);
    const selected = normalized ?? fallback;
    const toolCall = selected
      ? this.ensureGetProductStockArgs(selected, body.messages)
      : null;

    // Tool gerekmezse direkt stream final.
    if (!toolCall) {
      const url = this.chatUrl;
      const payload = {
        model: this.model,
        stream: true,
        messages: initialMessages,
        options: {
          num_ctx: this.numCtx,
          temperature: 0.7,
          top_p: 0.9,
        },
      };
      try {
        const res = await firstValueFrom(
          this.http.post(url, payload, {
            responseType: 'stream',
            timeout: this.requestTimeoutMs,
          }),
        );
        return res.data;
      } catch (err: any) {
        this.throwNormalizedOllamaError(err, url);
      }
    }

    // 2) Tool'u calistir.
    if (body.storeId && toolCall.args && toolCall.args.storeId == null) {
      toolCall.args.storeId = body.storeId;
    }

    const toolResult = await this.tools.execute(toolCall);

    // 3) Tool sonucunu deterministik formatta dondur.
    const finalContent = this.formatToolResultForUser(toolCall, toolResult);
    return this.buildSingleMessageStream(finalContent);
  }
}
