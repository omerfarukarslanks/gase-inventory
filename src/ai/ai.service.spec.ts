import { AiService } from './ai.service';

describe('AiService intent/date normalization', () => {
  let service: AiService;

  beforeEach(() => {
    const http = { post: jest.fn() } as any;
    const tools = { execute: jest.fn() } as any;
    service = new AiService(http, tools);
  });

  const formatUtcDay = (date: Date): string => date.toISOString().slice(0, 10);

  const addUtcDays = (date: Date, days: number): Date => {
    const copy = new Date(date);
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
  };

  it('should parse "bugunun" as today range', () => {
    const today = formatUtcDay(new Date());
    const range = (service as any).inferDateRangeFromText(
      'Bugunun satis ozetini ver.',
    );

    expect(range).toEqual({ from: today, to: today });
  });

  it('should parse "son 1 hafta" as last 7 days (inclusive)', () => {
    const today = new Date();
    const to = formatUtcDay(today);
    const from = formatUtcDay(addUtcDays(today, -6));

    const range = (service as any).inferDateRangeFromText(
      'Son 1 haftada iptal edilen siparis toplami nedir?',
    );

    expect(range).toEqual({ from, to });
  });

  it('should parse "gecen ay" as previous month range', () => {
    const today = new Date();
    const prevMonthStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1),
    );
    const prevMonthEnd = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0),
    );

    const range = (service as any).inferDateRangeFromText(
      'Gecen ay toplam ciro nedir?',
    );

    expect(range).toEqual({
      from: formatUtcDay(prevMonthStart),
      to: formatUtcDay(prevMonthEnd),
    });
  });

  it('should map stock alarm prompts to low_stock_alerts', () => {
    const call = (service as any).inferToolCallFromUserMessage([
      { role: 'user', content: 'Stok alarmi veren urunleri getir.' },
    ]);

    expect(call?.name).toBe('low_stock_alerts');
  });

  it('should map store stock prompts to stock_summary', () => {
    const call = (service as any).inferToolCallFromUserMessage([
      { role: 'user', content: 'Kadikoy subesindeki stok raporunu ver.' },
    ]);

    expect(call?.name).toBe('stock_summary');
  });

  it('should map order analysis prompts to sales_summary fallback', () => {
    const call = (service as any).inferToolCallFromUserMessage([
      { role: 'user', content: 'Ortalama siparis tutari nedir?' },
    ]);

    expect(call?.name).toBe('sales_summary');
  });

  it('should map dead stock month expression to noSaleDays', () => {
    const call = (service as any).inferToolCallFromUserMessage([
      { role: 'user', content: '3 aydir satilmayan urunler.' },
    ]);

    expect(call?.name).toBe('dead_stock_report');
    expect(call?.args?.noSaleDays).toBe(90);
  });

  it('should normalize alias store_stock_report -> stock_summary', () => {
    const call = (service as any).tryParseToolCall(
      'TOOL:{"name":"store_stock_report","args":{"page":1}}',
    );

    expect(call).toEqual({
      name: 'stock_summary',
      args: { page: 1 },
    });
  });

  it('should normalize alias order_analysis_report -> sales_summary', () => {
    const call = (service as any).tryParseToolCall(
      'TOOL:{"name":"order_analysis_report","args":{}}',
    );

    expect(call).toEqual({
      name: 'sales_summary',
      args: {},
    });
  });

  it('should hide unit price field when user asks not to return it', () => {
    const output = (service as any).formatToolResultForUser(
      { name: 'returned_orders_total_report', args: {} },
      {
        name: 'returned_orders_total_report',
        ok: true,
        data: {
          totals: {
            orderCount: 3,
            totalUnitPrice: 1500,
            totalLineTotal: 1800,
          },
        },
      },
      'Bu ay kac siparis iade edildi, sadece unit price alanini donme.',
    );

    expect(output).toContain('Siparis adedi: 3');
    expect(output).toContain('Toplam line total: 1800');
    expect(output).not.toContain('Toplam unit price');
  });

  it('should keep all fields by default in returned orders summary', () => {
    const output = (service as any).formatToolResultForUser(
      { name: 'returned_orders_total_report', args: {} },
      {
        name: 'returned_orders_total_report',
        ok: true,
        data: {
          totals: {
            orderCount: 2,
            totalUnitPrice: 1000,
            totalLineTotal: 1200,
          },
        },
      },
      'Bu ay kac siparis iade edildi?',
    );

    expect(output).toContain('Siparis adedi: 2');
    expect(output).toContain('Toplam unit price: 1000');
    expect(output).toContain('Toplam line total: 1200');
  });
});
