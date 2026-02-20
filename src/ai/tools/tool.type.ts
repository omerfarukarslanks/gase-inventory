export type ToolName =
  | 'search_products'
  | 'get_product_stock'
  | 'sales_summary'
  | 'store_performance'
  | 'stock_summary'
  | 'low_stock_alerts'
  | 'total_stock_quantity_report'
  | 'confirmed_orders_total_report'
  | 'returned_orders_total_report'
  | 'sales_by_product_report'
  | 'inventory_movements_summary'
  | 'sales_cancellations'
  | 'profit_margin_report'
  | 'revenue_trend_report'
  | 'tax_summary_report'
  | 'cogs_movement_report'
  | 'vat_summary_report'
  | 'audit_trail_report'
  | 'discount_summary_report'
  | 'employee_sales_performance_report'
  | 'employee_hourly_performance_report'
  | 'hourly_sales_report'
  | 'seasonality_report'
  | 'week_comparison_report'
  | 'product_performance_ranking_report'
  | 'dead_stock_report'
  | 'abc_analysis_report'
  | 'variant_comparison_report'
  | 'top_customers_report'
  | 'customer_purchase_history_report'
  | 'customer_frequency_report'
  | 'discount_effectiveness_report'
  | 'store_price_comparison_report'
  | 'sales_by_discount_band_report'
  | 'stock_turnover_report'
  | 'stock_aging_report'
  | 'reorder_analysis_report'
  | 'transfer_analysis_report'
  | 'transfer_balance_recommendation_report';

export interface ToolCall {
  name: ToolName;
  args: Record<string, any>;
}

export interface ToolResult {
  name: ToolName;
  ok: boolean;
  data?: any;
  error?: string;
  meta?: Record<string, any>;
}
