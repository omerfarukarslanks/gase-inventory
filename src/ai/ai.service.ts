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

const TOOL_NAMES = new Set<ToolName>([
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

const DATE_RANGE_AWARE_TOOLS = new Set<ToolName>([
  'confirmed_orders_total_report',
  'returned_orders_total_report',
  'sales_summary',
  'store_performance',
  'sales_by_product_report',
  'sales_cancellations',
]);

const TOOL_ALIASES: Record<string, ToolName> = {
  store_stock_report: 'stock_summary',
  order_analysis_report: 'sales_summary',
};

const NUMBER_WORDS: Record<string, number> = {
  bir: 1,
  iki: 2,
  uc: 3,
  dort: 4,
  bes: 5,
  alti: 6,
  yedi: 7,
  sekiz: 8,
  dokuz: 9,
  on: 10,
};

@Injectable()
export class AiService {
  constructor(
    private readonly http: HttpService,
    private readonly tools: ToolService,
  ) {}

  private get baseUrl() {
    return process.env.OLLAMA_BASE_URL ?? 'http://192.168.1.103:11434';
  }

  private get model() {
    return process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';
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
      return 4096;
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

  private normalizeRequestedToolName(rawName: string): ToolName | null {
    const normalized = rawName.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const alias = TOOL_ALIASES[normalized];
    if (alias) {
      return alias;
    }

    return TOOL_NAMES.has(normalized as ToolName)
      ? (normalized as ToolName)
      : null;
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
      const resolvedName = this.normalizeRequestedToolName(
        String(obj?.name ?? ''),
      );
      if (!resolvedName) {
        return null;
      }
      const args =
        obj?.args && typeof obj.args === 'object' && !Array.isArray(obj.args)
          ? obj.args
          : {};
      return { name: resolvedName, args };
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

  private normalizeIntentText(value: string): string {
    return value
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private parseCountToken(raw: string | undefined): number | null {
    if (!raw) {
      return null;
    }

    const lowered = raw.trim().toLowerCase();
    if (!lowered) {
      return null;
    }

    const asNumber = Number(lowered);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return Math.trunc(asNumber);
    }

    return NUMBER_WORDS[lowered] ?? null;
  }

  private includesAny(text: string, terms: string[]): boolean {
    return terms.some((term) => text.includes(term));
  }

  private startOfUtcDay(date: Date): Date {
    const copy = new Date(date);
    copy.setUTCHours(0, 0, 0, 0);
    return copy;
  }

  private endOfUtcDay(date: Date): Date {
    const copy = new Date(date);
    copy.setUTCHours(23, 59, 59, 999);
    return copy;
  }

  private addUtcDays(date: Date, days: number): Date {
    const copy = new Date(date);
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
  }

  private formatUtcDay(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private isIsoDayString(value: unknown): value is string {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  private getWeekStartUtc(date: Date): Date {
    const day = date.getUTCDay();
    const shiftToMonday = (day + 6) % 7;
    return this.addUtcDays(this.startOfUtcDay(date), -shiftToMonday);
  }

  private inferDateRangeFromText(
    text: string,
  ): { from?: string; to?: string } | null {
    const normalized = this.normalizeIntentText(text);
    if (!normalized.trim()) {
      return null;
    }

    const now = new Date();
    const todayStart = this.startOfUtcDay(now);
    const todayEnd = this.endOfUtcDay(now);

    const toRange = (from: Date, to: Date) => ({
      from: this.formatUtcDay(from),
      to: this.formatUtcDay(to),
    });

    if (
      /\b(?:bugun|bugunun|bugunku|bu\s+gun|bu\s+gunun|bugunde|bugune|today|todays)\b/.test(
        normalized,
      )
    ) {
      return toRange(todayStart, todayEnd);
    }

    if (/\b(?:dun|yesterday)\b/.test(normalized)) {
      const yesterday = this.addUtcDays(todayStart, -1);
      return toRange(yesterday, yesterday);
    }

    if (/\b(?:bu hafta|this week)\b/.test(normalized)) {
      const weekStart = this.getWeekStartUtc(todayStart);
      return toRange(weekStart, todayEnd);
    }

    const lastWeekMatch = normalized.match(
      /\b(?:son|last)\s+(\d+|bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz|on)\s*(?:hafta|week)(?:da|lik|dir|boyunca|s)?\b/,
    );
    const weekCount = this.parseCountToken(lastWeekMatch?.[1]);
    if (weekCount) {
      const weeks = Math.max(1, weekCount);
      const totalDays = weeks * 7;
      const from = this.addUtcDays(todayStart, -(totalDays - 1));
      return toRange(from, todayEnd);
    }

    if (/\b(?:son hafta|last week)\b/.test(normalized)) {
      const from = this.addUtcDays(todayStart, -6);
      return toRange(from, todayEnd);
    }

    const lastDayMatch = normalized.match(
      /\b(?:son|last)\s+(\d+|bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz|on)\s*(?:gun|day)(?:de|dur|luk|boyunca|s)?\b/,
    );
    const dayCount = this.parseCountToken(lastDayMatch?.[1]);
    if (dayCount) {
      const days = Math.max(1, dayCount);
      const from = this.addUtcDays(todayStart, -(days - 1));
      return toRange(from, todayEnd);
    }

    if (/\b(?:bu ay|this month)\b/.test(normalized)) {
      const monthStart = new Date(
        Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth(), 1),
      );
      return toRange(monthStart, todayEnd);
    }

    if (/\b(?:gecen ay|onceki ay|last month)\b/.test(normalized)) {
      const prevMonthStart = new Date(
        Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth() - 1, 1),
      );
      const prevMonthEnd = new Date(
        Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth(), 0),
      );
      return toRange(prevMonthStart, this.endOfUtcDay(prevMonthEnd));
    }

    const lastMonthMatch = normalized.match(
      /\b(?:son|last)\s+(\d+|bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz|on)\s*(?:ay|month)(?:da|lik|dir|boyunca|s)?\b/,
    );
    const monthCount = this.parseCountToken(lastMonthMatch?.[1]);
    if (monthCount) {
      const months = Math.max(1, monthCount);
      const from = new Date(
        Date.UTC(
          todayStart.getUTCFullYear(),
          todayStart.getUTCMonth() - months + 1,
          1,
        ),
      );
      return toRange(from, todayEnd);
    }

    if (/\b(?:bu yil|this year)\b/.test(normalized)) {
      const yearStart = new Date(Date.UTC(todayStart.getUTCFullYear(), 0, 1));
      return toRange(yearStart, todayEnd);
    }

    return null;
  }

  private async inferDateRangeFromTextWithModel(
    text: string,
  ): Promise<{ from?: string; to?: string } | null> {
    const userText = text.trim();
    if (!userText) {
      return null;
    }

    const today = this.formatUtcDay(this.startOfUtcDay(new Date()));
    const systemPrompt = [
      'Extract a date range from the user message regardless of language.',
      `Today is ${today}.`,
      'Return only one JSON object.',
      'Allowed outputs:',
      '- {} when no date/time range is present.',
      '- {"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}',
      'Rules:',
      '- Resolve relative dates (today, yesterday, last week, last 7 days, this month).',
      '- Use inclusive ranges.',
      '- Do not include explanations or markdown.',
    ].join('\n');

    try {
      const response = await this.chatOnceRaw(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText },
        ],
        true,
      );
      const content = String(response?.message?.content ?? '');
      const json = this.extractFirstJsonObject(content);
      if (!json) {
        return null;
      }

      const parsed = JSON.parse(json) as { from?: unknown; to?: unknown };
      const from = this.isIsoDayString(parsed?.from) ? parsed.from : undefined;
      const to = this.isIsoDayString(parsed?.to) ? parsed.to : undefined;

      if (!from && !to) {
        return null;
      }

      if (from && to && from > to) {
        return { from: to, to: from };
      }

      return { from, to };
    } catch {
      return null;
    }
  }

  private inferThresholdFromText(text: string): number | undefined {
    const byKeyword = text.match(/(?:esik|eÅŸik)\s*(\d{1,3})/i);
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
      /^(.+?)\s+Ã¼rÃ¼nÃ¼n?\s+stok/i,
      /^(.+?)\s+urun[unÄ±nin]*\s+stok/i,
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
        /\b(bana|lÃ¼tfen|lutfen|gÃ¶ster|goster|ver|getir|durumu|durumunu|raporu)\b/gi,
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
      /kritik.*stok|stok.*kritik|dusuk.*stok|stok.*dusuk|dÃ¼ÅŸÃ¼k.*stok|stok.*dÃ¼ÅŸÃ¼k/i.test(
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
    const text = this.normalizeIntentText(rawText);
    if (!rawText) {
      return null;
    }

    const inferNoSaleDays = (input: string): number | undefined => {
      const dayMatch = input.match(/\b(\d{1,4})\s*(?:gun|gundur|gunde)\b/);
      if (dayMatch?.[1]) {
        return Number(dayMatch[1]);
      }
      const monthMatch = input.match(/\b(\d{1,3})\s*(?:ay|aydir|aylik)\b/);
      if (monthMatch?.[1]) {
        return Number(monthMatch[1]) * 30;
      }
      return undefined;
    };

    if (
      this.includesAny(text, [
        'kritik stok',
        'stok seviyesi kritik',
        'minimum stok',
        'stok alarmi',
        'bitmek uzere',
        'azalan stok',
        'stok seviyesi',
        'depoda az kalan',
        'dusuk stok',
      ]) ||
      /stok.*altinda/.test(text)
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

    if (
      this.includesAny(text, [
        'magaza performans',
        'magazalar nasil',
        'store performans',
      ])
    ) {
      return {
        name: 'store_performance',
        args: { page: 1, limit: 10 },
      };
    }

    if (
      this.includesAny(text, [
        'satis ozeti',
        'toplam satis',
        'toplam ciro',
        'satis raporu',
        'satis performansi',
        'bugunku toplam satis',
      ]) ||
      /(?:bu ay|gecen ay|son \d+ gun|son \d+ hafta|bu yil).*(?:satis|ciro)/.test(
        text,
      )
    ) {
      return { name: 'sales_summary', args: {} };
    }

    if (
      this.includesAny(text, [
        'urun stok',
        'stok miktari',
        'stok durumu',
        'stok bilgisi',
        'varyant bazli stok',
        'magaza bazli stok dagilimi',
        'toplam kac adet kaldi',
        'hangi magazada kac adet',
      ]) ||
      /\bsku[a-z0-9_-]*\b/.test(text)
    ) {
      const inferredProduct =
        this.extractProductReferenceFromText(rawText) ?? rawText;
      return {
        name: 'get_product_stock',
        args: { query: inferredProduct },
      };
    }

    if (
      this.includesAny(text, [
        'tum stoklari getir',
        'stok raporunu ver',
        'subesindeki stok',
        'magazasindaki stok',
        'stok ozet',
      ])
    ) {
      return {
        name: 'stock_summary',
        args: { page: 1, limit: 10 },
      };
    }

    if (
      this.includesAny(text, [
        'iade',
        'iptal edilen',
        'iptal siparis',
        'iptal satis',
        'iade tutari',
        'iptal orani',
      ])
    ) {
      return { name: 'returned_orders_total_report', args: {} };
    }

    if (
      this.includesAny(text, [
        'confirmed siparis',
        'onayli siparis',
      ])
    ) {
      return { name: 'confirmed_orders_total_report', args: {} };
    }

    if (
      this.includesAny(text, [
        'en yuksek tutarli siparis',
        'ortalama siparis tutari',
        'siparis basina ortalama urun',
      ])
    ) {
      // order_analysis_report alias'i sales_summary'e normalize edilir.
      return { name: 'sales_summary', args: {} };
    }

    if (
      this.includesAny(text, [
        'kar marj',
        'karlilik',
        'brut kar',
        'net kar',
        'profit',
      ])
    ) {
      return { name: 'profit_margin_report', args: { page: 1, limit: 10 } };
    }

    if (
      this.includesAny(text, [
        'en cok satan',
        'en iyi performans',
        'urun performans',
        'en fazla gelir getiren',
        'satis adedine gore',
        'en hizli tukenen',
      ])
    ) {
      return { name: 'product_performance_ranking_report', args: { page: 1, limit: 10 } };
    }

    if (
      this.includesAny(text, [
        'olu stok',
        'dead stock',
        'satilmayan',
        'hareketsiz stok',
        'depoda duran urunler',
      ])
    ) {
      return {
        name: 'dead_stock_report',
        args: { noSaleDays: inferNoSaleDays(text) ?? 30, page: 1, limit: 10 },
      };
    }

    if (
      this.includesAny(text, [
        'calisan satis performans',
        'en cok satis yapan personel',
        'personel bazli ciro',
        'calisan basina ortalama satis',
      ])
    ) {
      return { name: 'employee_sales_performance_report', args: { page: 1, limit: 10 } };
    }

    if (
      this.includesAny(text, [
        'en iyi musteri',
        'en cok alisveris yapan musteri',
        'toplam harcamasi en yuksek musteri',
        'en aktif musteri',
        'top musteri',
      ])
    ) {
      return { name: 'top_customers_report', args: { page: 1, limit: 10 } };
    }

    if (
      this.includesAny(text, [
        'gelir trend',
        'revenue trend',
        'gelir grafigi',
        'ciro dagilimi',
        'satis trendi',
        'gelir karsilastirmasi',
      ])
    ) {
      let groupBy: 'day' | 'week' | 'month' = 'day';
      if (this.includesAny(text, ['haftalik', 'weekly', 'week'])) {
        groupBy = 'week';
      } else if (
        this.includesAny(text, ['aylik', 'monthly', 'month', 'yillik', 'yearly', 'year'])
      ) {
        groupBy = 'month';
      }

      return { name: 'revenue_trend_report', args: { groupBy } };
    }

    if (this.includesAny(text, ['abc analiz', 'pareto'])) {
      return { name: 'abc_analysis_report', args: {} };
    }

    if (this.includesAny(text, ['stok devir', 'turnover'])) {
      return { name: 'stock_turnover_report', args: { page: 1, limit: 10 } };
    }

    if (
      this.includesAny(text, ['transfer denge', 'transfer oneri', 'dengesizlik'])
    ) {
      return { name: 'transfer_balance_recommendation_report', args: { page: 1, limit: 10 } };
    }

    if (
      this.includesAny(text, [
        'transfer analiz',
        'magaza transfer',
        'magazalar arasi transfer',
        'en cok transfer',
        'transfer hacmi',
      ])
    ) {
      return { name: 'transfer_analysis_report', args: { page: 1, limit: 10 } };
    }

    if (
      this.includesAny(text, [
        'indirim etkisi',
        'kampanya etkisi',
        'kampanya analiz',
      ])
    ) {
      return { name: 'discount_effectiveness_report', args: {} };
    }

    if (this.includesAny(text, ['kdv', 'vat', 'vergi ozet'])) {
      return { name: 'vat_summary_report', args: {} };
    }

    if (this.includesAny(text, ['denetim', 'audit'])) {
      return { name: 'audit_trail_report', args: { page: 1, limit: 20 } };
    }

    if (
      this.includesAny(text, [
        'saatlik satis dagilimi',
        'en yogun satis saati',
        'gunlere gore satis yogunlugu',
        'hafta ici',
        'hafta sonu',
      ])
    ) {
      return { name: 'hourly_sales_report', args: {} };
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

  private async ensureDateRangeArgs(
    call: ToolCall,
    userMessages: any[],
  ): Promise<ToolCall> {
    if (!DATE_RANGE_AWARE_TOOLS.has(call.name)) {
      return call;
    }

    const args = { ...(call.args ?? {}) } as Record<string, any>;
    const hasExplicitDate = [args.from, args.to, args.startDate, args.endDate].some(
      (value) => typeof value === 'string' && value.trim().length > 0,
    );
    if (hasExplicitDate) {
      return { ...call, args };
    }

    const inferredLocal = this.inferDateRangeFromText(
      this.getLastUserMessage(userMessages),
    );
    const inferred =
      inferredLocal ??
      (await this.inferDateRangeFromTextWithModel(
        this.getLastUserMessage(userMessages),
      ));
    if (!inferred) {
      return { ...call, args };
    }

    if (inferred.from) {
      args.from = inferred.from;
    }
    if (inferred.to) {
      args.to = inferred.to;
    }

    return { ...call, args };
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

  private parseOrderSummaryFieldPreferences(userText?: string): {
    showOrderCount: boolean;
    showUnitPrice: boolean;
    showLineTotal: boolean;
  } {
    const defaults = {
      showOrderCount: true,
      showUnitPrice: true,
      showLineTotal: true,
    };

    const text = this.normalizeIntentText(userText ?? '').trim();
    if (!text) {
      return defaults;
    }

    const mentionsOrderCount = /siparis adedi|siparis sayisi|order count/.test(
      text,
    );
    const mentionsUnitPrice = /unit\s*price|birim fiyat|unitprice/.test(text);
    const mentionsLineTotal = /line\s*total|toplam tutar|ciro|total line/.test(
      text,
    );

    const hasNegativeInstruction =
      /\bdonme\b|\bdondurme\b|\bgosterme\b|\bgetirme\b|\bolmasin\b|\bharic\b|\bexclude\b|\bwithout\b|\bexcept\b/.test(
        text,
      );

    const next = { ...defaults };

    if (hasNegativeInstruction) {
      if (mentionsOrderCount) {
        next.showOrderCount = false;
      }
      if (mentionsUnitPrice) {
        next.showUnitPrice = false;
      }
      if (mentionsLineTotal) {
        next.showLineTotal = false;
      }
    }

    return next;
  }

  private formatToolResultForUser(
    call: ToolCall,
    result: ToolResult,
    userText?: string,
  ): string {
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
            )}, confirmed ${this.toNumber(row.confirmedCount)}, iptal oranÄ± ${this.toNumber(
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
        const prefs = this.parseOrderSummaryFieldPreferences(userText);
        const lines = [`${label}:`];

        if (prefs.showOrderCount) {
          lines.push(`- Siparis adedi: ${this.toNumber(totals.orderCount)}`);
        }
        if (prefs.showUnitPrice) {
          lines.push(`- Toplam unit price: ${this.toNumber(totals.totalUnitPrice)}`);
        }
        if (prefs.showLineTotal) {
          lines.push(`- Toplam line total: ${this.toNumber(totals.totalLineTotal)}`);
        }

        if (lines.length === 1) {
          lines.push('- Gosterilecek alan kalmadi.');
        }

        return lines.join('\n');
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

    // 1) Deterministik intent varsa dogrudan tool sec (ek LLM turunu atla).
    const inferredDirect = this.inferToolCallFromUserMessage(body.messages);
    let toolCall: ToolCall | null = null;
    if (inferredDirect) {
      toolCall = await this.ensureDateRangeArgs(
        this.ensureGetProductStockArgs(inferredDirect, body.messages),
        body.messages,
      );
    }

    // 2) Belirsiz durumda ilk non-stream cevapla tool cagrisi parse et.
    if (!toolCall) {
      const first = await this.chatOnceRaw(initialMessages, true);
      const content = String(first?.message?.content ?? '');
      const parsed = this.tryParseToolCall(content);
      const normalized = parsed
        ? this.normalizeToolCallByIntent(parsed, body.messages)
        : null;
      const selected = normalized ?? this.inferToolCallFromUserMessage(body.messages);
      if (selected) {
        toolCall = await this.ensureDateRangeArgs(
          this.ensureGetProductStockArgs(selected, body.messages),
          body.messages,
        );
      } else {
        toolCall = null;
      }

      if (!toolCall) {
        return this.buildSingleMessageStream(content);
      }
    }

    // 3) Tool'u calistir.
    if (body.storeId && toolCall.args && toolCall.args.storeId == null) {
      toolCall.args.storeId = body.storeId;
    }

    const toolResult = await this.tools.execute(toolCall);

    // 4) Tool sonucunu deterministik formatta dondur.
    const finalContent = this.formatToolResultForUser(
      toolCall,
      toolResult,
      this.getLastUserMessage(body.messages),
    );
    return this.buildSingleMessageStream(finalContent);
  }
}

