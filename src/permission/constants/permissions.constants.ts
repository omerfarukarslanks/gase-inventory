import { UserRole } from 'src/user/user.entity';

/**
 * Sistemdeki tüm yetki tanımları.
 * Her yetki bir endpoint veya işlemi temsil eder.
 */
export const Permissions = {
  // ─── Stok ───────────────────────────────────────────
  STOCK_LIST_READ:       'STOCK_LIST_READ',
  STOCK_MOVEMENTS_READ:  'STOCK_MOVEMENTS_READ',
  STOCK_LOW_ALERTS_READ: 'STOCK_LOW_ALERTS_READ',
  STOCK_SUMMARY_READ:    'STOCK_SUMMARY_READ',
  STOCK_RECEIVE:         'STOCK_RECEIVE',
  STOCK_TRANSFER:        'STOCK_TRANSFER',
  STOCK_ADJUST:          'STOCK_ADJUST',

  // ─── Satış ──────────────────────────────────────────
  SALE_CREATE:          'SALE_CREATE',
  SALE_READ:            'SALE_READ',
  SALE_UPDATE:          'SALE_UPDATE',
  SALE_CANCEL:          'SALE_CANCEL',
  SALE_PAYMENT_CREATE:  'SALE_PAYMENT_CREATE',
  SALE_PAYMENT_READ:    'SALE_PAYMENT_READ',
  SALE_PAYMENT_UPDATE:  'SALE_PAYMENT_UPDATE',
  SALE_LINE_CREATE:     'SALE_LINE_CREATE',
  SALE_LINE_UPDATE:     'SALE_LINE_UPDATE',
  SALE_RETURN_CREATE:   'SALE_RETURN_CREATE',
  SALE_RETURN_READ:   'SALE_RETURN_READ',
  SALE_RECEIPT_READ:    'SALE_RECEIPT_READ',

  // ─── Ürün ───────────────────────────────────────────
  PRODUCT_READ:             'PRODUCT_READ',
  PRODUCT_CREATE:           'PRODUCT_CREATE',
  PRODUCT_UPDATE:           'PRODUCT_UPDATE',
  PRODUCT_DELETE:           'PRODUCT_DELETE',

  PRODUCT_VARIANT_CREATE:   'PRODUCT_VARIANT_CREATE',
  PRODUCT_VARIANT_UPDATE:   'PRODUCT_VARIANT_UPDATE',

  PRODUCT_BARCODE_LOOKUP:   'PRODUCT_BARCODE_LOOKUP',
  
  PRODUCT_CATEGORY_READ: 'PRODUCT_CATEGORY_READ',
  PRODUCT_CATEGORY_CREATE: 'PRODUCT_CATEGORY_CREATE',
  PRODUCT_CATEGORY_UPDATE: 'PRODUCT_CATEGORY_UPDATE',

  PRODUCT_PACKAGE_READ:   'PRODUCT_PACKAGE_READ',
  PRODUCT_PACKAGE_CREATE:   'PRODUCT_PACKAGE_CREATE',
  PRODUCT_PACKAGE_UPDATE:   'PRODUCT_PACKAGE_UPDATE',

  PRODUCT_ATTRIBUTE_READ: 'PRODUCT_ATTRIBUTE_READ',
  PRODUCT_ATTRIBUTE_UPDATE: 'PRODUCT_ATTRIBUTE_UPDATE',
  PRODUCT_ATTRIBUTE_CREATE: 'PRODUCT_ATTRIBUTE_CREATE',

  // ─── Fiyat ──────────────────────────────────────────
  PRICE_READ:   'PRICE_READ',
  PRICE_MANAGE: 'PRICE_MANAGE',

  // ─── Mağaza ─────────────────────────────────────────
  STORE_READ:   'STORE_READ',
  STORE_CREATE: 'STORE_CREATE',
  STORE_UPDATE: 'STORE_UPDATE',
  STORE_DELETE: 'STORE_DELETE',
  STORE_VIEW: 'STORE_VIEW',

  // ─── Kullanıcı ──────────────────────────────────────
  USER_READ:         'USER_READ',
  USER_CREATE:       'USER_CREATE',
  USER_UPDATE:       'USER_UPDATE',
  USER_DELETE:       'USER_DELETE',
  USER_STORE_ASSIGN: 'USER_STORE_ASSIGN',

  // ─── Tedarikçi ──────────────────────────────────────
  SUPPLIER_READ:   'SUPPLIER_READ',
  SUPPLIER_CREATE: 'SUPPLIER_CREATE',
  SUPPLIER_UPDATE: 'SUPPLIER_UPDATE',

  // ─── Müşteri ────────────────────────────────────────
  CUSTOMER_READ:   'CUSTOMER_READ',
  CUSTOMER_CREATE:   'CUSTOMER_CREATE',
  CUSTOMER_UPDATE:   'CUSTOMER_UPDATE',

  // ─── Raporlar ───────────────────────────────────────
  REPORT_STOCK_READ:     'REPORT_STOCK_READ',
  REPORT_SALES_READ:     'REPORT_SALES_READ',
  REPORT_FINANCIAL_READ: 'REPORT_FINANCIAL_READ',
  REPORT_EMPLOYEE_READ:  'REPORT_EMPLOYEE_READ',
  REPORT_CUSTOMER_READ:  'REPORT_CUSTOMER_READ',
  REPORT_INVENTORY_READ: 'REPORT_INVENTORY_READ',

  // ─── Satın Alma ─────────────────────────────────────
  PO_CREATE:          'PO_CREATE',
  PO_READ:            'PO_READ',
  PO_APPROVE:         'PO_APPROVE',
  PO_CANCEL:          'PO_CANCEL',
  PO_RECEIPT_CREATE:  'PO_RECEIPT_CREATE',

  // ─── İkmal (Replenishment) ───────────────────────────
  REPLENISHMENT_RULE_MANAGE: 'REPLENISHMENT_RULE_MANAGE',
  REPLENISHMENT_READ:        'REPLENISHMENT_READ',
  REPLENISHMENT_ACCEPT:      'REPLENISHMENT_ACCEPT',
  REPLENISHMENT_DISMISS:     'REPLENISHMENT_DISMISS',

  AUDIT_LOG_READ: 'AUDIT_LOG_READ',

  // ─── Ticaret (Trade) ────────────────────────────────
  TRADE_READ:   'TRADE_READ',
  TRADE_MANAGE: 'TRADE_MANAGE',

  // ─── Depo / Sayım ───────────────────────────────────
  WAREHOUSE_MANAGE:     'WAREHOUSE_MANAGE',
  WAREHOUSE_READ:       'WAREHOUSE_READ',
  COUNT_SESSION_MANAGE: 'COUNT_SESSION_MANAGE',
  COUNT_SESSION_READ:   'COUNT_SESSION_READ',
  COUNT_SESSION_ADJUST: 'COUNT_SESSION_ADJUST',

  // ─── Onay Akışı (Approval) ───────────────────────────
  APPROVAL_READ:      'APPROVAL_READ',
  APPROVAL_REQUEST:   'APPROVAL_REQUEST',
  APPROVAL_REVIEW:    'APPROVAL_REVIEW',
  APPROVAL_REVIEW_L2: 'APPROVAL_REVIEW_L2',

  // ─── Entegrasyon ────────────────────────────────────
  INTEGRATION_READ:   'INTEGRATION_READ',
  INTEGRATION_MANAGE: 'INTEGRATION_MANAGE',

  // ─── AI Aksiyonlar ───────────────────────────────────
  AI_ACTION_CONFIRM: 'AI_ACTION_CONFIRM',

  // ─── Sistem ─────────────────────────────────────────
  EXCHANGE_RATE_READ:   'EXCHANGE_RATE_READ',
  EXCHANGE_RATE_MANAGE: 'EXCHANGE_RATE_MANAGE',
  AI_CHAT:              'AI_CHAT',
  PERMISSION_MANAGE:    'PERMISSION_MANAGE',
} as const;

export type PermissionName = (typeof Permissions)[keyof typeof Permissions];

/** Her yetki için grup ve açıklama (Swagger / UI için) */
export const PERMISSION_META: Record<
  PermissionName,
  { group: string; description: string }
> = {
  STOCK_LIST_READ:       { group: 'Stok',      description: 'Stok listesi görüntüleme' },
  STOCK_MOVEMENTS_READ:  { group: 'Stok',      description: 'Stok hareket geçmişi görüntüleme' },
  STOCK_LOW_ALERTS_READ: { group: 'Stok',      description: 'Düşük stok uyarıları görüntüleme' },
  STOCK_SUMMARY_READ:    { group: 'Stok',      description: 'Stok özet raporu görüntüleme' },
  STOCK_RECEIVE:         { group: 'Stok',      description: 'Stok girişi yapma (tedarik/iade)' },
  STOCK_TRANSFER:        { group: 'Stok',      description: 'Mağazalar arası stok transferi' },
  STOCK_ADJUST:          { group: 'Stok',      description: 'Stok düzeltme (manuel ayar)' },

  SALE_CREATE:          { group: 'Satış', description: 'Yeni satış fişi oluşturma' },
  SALE_READ:            { group: 'Satış', description: 'Satış fişi görüntüleme' },
  SALE_UPDATE:          { group: 'Satış', description: 'Satış fişi düzenleme' },
  SALE_CANCEL:          { group: 'Satış', description: 'Satış fişi iptal etme' },
  SALE_PAYMENT_READ:    { group: 'Satış', description: 'Ödeme kaydı listeleme' },
  SALE_PAYMENT_CREATE:  { group: 'Satış', description: 'Ödeme kaydı ekleme' },
  SALE_PAYMENT_UPDATE:  { group: 'Satış', description: 'Ödeme kaydı düzenleme' },
  SALE_LINE_CREATE:     { group: 'Satış', description: 'Satış satırı ekleme' },
  SALE_LINE_UPDATE:     { group: 'Satış', description: 'Satış satırı güncelleme' },
  SALE_RETURN_CREATE:   { group: 'Satış', description: 'Kısmi iade oluşturma' },
  SALE_RETURN_READ:     { group: 'Satış', description: 'Kısmi iade listeleme' },
  SALE_RECEIPT_READ:    { group: 'Satış', description: 'Satış fişi PDF indirme' },

  PRODUCT_READ:             { group: 'Ürün', description: 'Ürün/varyant listeleme ve görüntüleme' },
  PRODUCT_CREATE:           { group: 'Ürün', description: 'Yeni ürün oluşturma' },
  PRODUCT_UPDATE:           { group: 'Ürün', description: 'Ürün/varyant güncelleme' },
  PRODUCT_DELETE:           { group: 'Ürün', description: 'Ürün/varyant silme (pasife alma)' },
  
  PRODUCT_VARIANT_CREATE:   { group: 'Ürün', description: 'Ürün varyantı oluşturma' },
  PRODUCT_VARIANT_UPDATE:   { group: 'Ürün', description: 'Ürün varyantı güncelleme' },

  PRODUCT_BARCODE_LOOKUP:   { group: 'Ürün', description: 'Barkod ile ürün arama' },

  PRODUCT_CATEGORY_CREATE:  { group: 'Ürün', description: 'Ürün kategorisi Oluşturma' },
  PRODUCT_CATEGORY_READ:  { group: 'Ürün', description: 'Ürün kategorisi Listeleme' },
  PRODUCT_CATEGORY_UPDATE:  { group: 'Ürün', description: 'Ürün kategorisi güncelleme' },

  PRODUCT_PACKAGE_READ:   { group: 'Ürün', description: 'Ürün paketi listeleme' },
  PRODUCT_PACKAGE_CREATE:   { group: 'Ürün', description: 'Ürün paketi oluşturma' },
  PRODUCT_PACKAGE_UPDATE:   { group: 'Ürün', description: 'Ürün paketi güncelleme' },

  PRODUCT_ATTRIBUTE_READ: { group: 'Ürün', description: 'Ürün özelliği(attribute) listeleme'},
  PRODUCT_ATTRIBUTE_UPDATE: { group: 'Ürün', description: 'Ürün özelliği (attribute) güncelleme'},
  PRODUCT_ATTRIBUTE_CREATE: { group: 'Ürün', description: 'Ürün özelliği (attribute) oluşturma'},


  PRICE_READ:   { group: 'Fiyat', description: 'Mağaza fiyatlarını görüntüleme' },
  PRICE_MANAGE: { group: 'Fiyat', description: 'Mağaza bazlı fiyat/vergi/indirim tanımlama' },

  STORE_READ:   { group: 'Mağaza', description: 'Mağaza bilgilerini listeleme' },
  STORE_VIEW:   { group: 'Mağaza', description: 'Mağaza bilgilerini görüntüleme' },
  STORE_CREATE: { group: 'Mağaza', description: 'Yeni mağaza oluşturma' },
  STORE_UPDATE: { group: 'Mağaza', description: 'Mağaza bilgilerini güncelleme' },
  STORE_DELETE: { group: 'Mağaza', description: 'Mağazayı pasife alma (soft delete)' },

  USER_READ:         { group: 'Kullanıcı', description: 'Kullanıcı listeleme ve görüntüleme' },
  USER_CREATE:       { group: 'Kullanıcı', description: 'Yeni kullanıcı oluşturma' },
  USER_UPDATE:       { group: 'Kullanıcı', description: 'Kullanıcı bilgileri güncelleme' },
  USER_DELETE:       { group: 'Kullanıcı', description: 'Kullanıcıyı pasife alma' },
  USER_STORE_ASSIGN: { group: 'Kullanıcı', description: 'Kullanıcıya mağaza atama / çıkarma' },

  SUPPLIER_READ:   { group: 'Tedarikçi', description: 'Tedarikçi listeleme ve görüntüleme' },
  SUPPLIER_CREATE: { group: 'Tedarikçi', description: 'Tedarikçi oluşturma' },
  SUPPLIER_UPDATE: { group: 'Tedarikçi', description: 'Tedarikçi güncelleme' },

  CUSTOMER_READ:   { group: 'Müşteri', description: 'Müşteri listeleme, görüntüleme ve bakiye' },
  CUSTOMER_CREATE: { group: 'Müşteri', description: 'Müşteri oluşturma' },
  CUSTOMER_UPDATE: { group: 'Müşteri', description: 'Müşteri güncelleme' },

  REPORT_STOCK_READ:     { group: 'Raporlar', description: 'Stok raporlarını görüntüleme' },
  REPORT_SALES_READ:     { group: 'Raporlar', description: 'Satış raporlarını görüntüleme' },
  REPORT_FINANCIAL_READ: { group: 'Raporlar', description: 'Finansal raporları görüntüleme' },
  REPORT_EMPLOYEE_READ:  { group: 'Raporlar', description: 'Çalışan raporlarını görüntüleme' },
  REPORT_CUSTOMER_READ:  { group: 'Raporlar', description: 'Müşteri raporlarını görüntüleme' },
  REPORT_INVENTORY_READ: { group: 'Raporlar', description: 'Envanter/stok analiz raporları' },

  PO_CREATE:         { group: 'Satın Alma', description: 'Satın alma siparişi oluşturma' },
  PO_READ:           { group: 'Satın Alma', description: 'Satın alma siparişlerini görüntüleme' },
  PO_APPROVE:        { group: 'Satın Alma', description: 'Satın alma siparişini onaylama' },
  PO_CANCEL:         { group: 'Satın Alma', description: 'Satın alma siparişini iptal etme' },
  PO_RECEIPT_CREATE: { group: 'Satın Alma', description: 'Mal teslim alma kaydı oluşturma' },

  REPLENISHMENT_RULE_MANAGE: { group: 'İkmal', description: 'İkmal kuralı oluşturma/güncelleme/silme' },
  REPLENISHMENT_READ:        { group: 'İkmal', description: 'İkmal kurallarını ve önerilerini görüntüleme' },
  REPLENISHMENT_ACCEPT:      { group: 'İkmal', description: 'İkmal önerisini onaylama (Draft PO oluşturur)' },
  REPLENISHMENT_DISMISS:     { group: 'İkmal', description: 'İkmal önerisini reddetme' },

  AUDIT_LOG_READ: { group: 'Sistem', description: 'Audit log kayıtlarını görüntüleme' },

  TRADE_READ:   { group: 'Ticaret', description: 'Müşteri grupları, kredi limitleri ve fiyat listelerini görüntüleme' },
  TRADE_MANAGE: { group: 'Ticaret', description: 'Müşteri grubu, kredi limiti, ödeme vadesi ve fiyat listesi yönetimi' },

  WAREHOUSE_MANAGE:     { group: 'Depo', description: 'Depo ve lokasyon oluşturma/güncelleme/silme' },
  WAREHOUSE_READ:       { group: 'Depo', description: 'Depo ve lokasyon listeleme' },
  COUNT_SESSION_MANAGE: { group: 'Depo', description: 'Sayım oturumu oluşturma ve satır ekleme' },
  COUNT_SESSION_READ:   { group: 'Depo', description: 'Sayım oturumlarını görüntüleme' },
  COUNT_SESSION_ADJUST: { group: 'Depo', description: 'Sayım oturumunu kapatma ve stok düzeltme uygulama' },

  APPROVAL_READ:      { group: 'Onay', description: 'Onay taleplerini görüntüleme' },
  APPROVAL_REQUEST:   { group: 'Onay', description: 'Onay talebi oluşturma ve geri çekme' },
  APPROVAL_REVIEW:    { group: 'Onay', description: 'L1 onay/red (stok düzeltme, fiyat override)' },
  APPROVAL_REVIEW_L2: { group: 'Onay', description: 'L2 onay/red — Admin/Owner (fiyat override ikinci seviye)' },

  INTEGRATION_READ:   { group: 'Entegrasyon', description: 'Entegrasyon bağlantılarını görüntüleme' },
  INTEGRATION_MANAGE: { group: 'Entegrasyon', description: 'Entegrasyon bağlantısı oluşturma/güncelleme/silme ve DLQ yönetimi' },

  AI_ACTION_CONFIRM: { group: 'AI', description: 'AI eylem önerilerini onaylama (PO oluşturma, fiyat/stok düzeltme talebi)' },

  EXCHANGE_RATE_READ:   { group: 'Sistem', description: 'Döviz kurlarını görüntüleme' },
  EXCHANGE_RATE_MANAGE: { group: 'Sistem', description: 'Tenant bazlı döviz kuru override yönetimi' },
  AI_CHAT:            { group: 'Sistem', description: 'AI asistan kullanımı' },
  PERMISSION_MANAGE:  { group: 'Sistem', description: 'Role-yetki haritasını yönetme' },
};

/**
 * Tenant yeni oluşturulduğunda her role için atanacak varsayılan yetkiler.
 * Bu değerler OWNER tarafından daha sonra değiştirilebilir.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionName[]> = {
  [UserRole.STAFF]: [
    Permissions.STOCK_LIST_READ,
    Permissions.STOCK_MOVEMENTS_READ,
    Permissions.STOCK_LOW_ALERTS_READ,
    Permissions.SALE_CREATE,
    Permissions.SALE_READ,
    Permissions.SALE_RECEIPT_READ,
    Permissions.PRODUCT_READ,
    Permissions.PRODUCT_BARCODE_LOOKUP,
    Permissions.CUSTOMER_READ,
    Permissions.STORE_READ,
    Permissions.EXCHANGE_RATE_READ,
    Permissions.AI_CHAT,
  ],

  [UserRole.MANAGER]: [
    Permissions.STOCK_LIST_READ,
    Permissions.STOCK_MOVEMENTS_READ,
    Permissions.STOCK_LOW_ALERTS_READ,
    Permissions.STOCK_SUMMARY_READ,
    Permissions.STOCK_RECEIVE,
    Permissions.STOCK_TRANSFER,
    Permissions.SALE_CREATE,
    Permissions.SALE_READ,
    Permissions.SALE_UPDATE,
    Permissions.SALE_CANCEL,
    Permissions.SALE_RECEIPT_READ,
    Permissions.PRODUCT_READ,
    Permissions.PRODUCT_CREATE,
    Permissions.PRODUCT_UPDATE,
    Permissions.PRODUCT_BARCODE_LOOKUP,
    Permissions.PRICE_READ,
    Permissions.SUPPLIER_READ,
    Permissions.CUSTOMER_READ,
    Permissions.STORE_READ,
    Permissions.PO_CREATE,
    Permissions.PO_READ,
    Permissions.PO_APPROVE,
    Permissions.PO_CANCEL,
    Permissions.PO_RECEIPT_CREATE,
    Permissions.REPLENISHMENT_RULE_MANAGE,
    Permissions.REPLENISHMENT_READ,
    Permissions.REPLENISHMENT_ACCEPT,
    Permissions.REPLENISHMENT_DISMISS,
    Permissions.WAREHOUSE_READ,
    Permissions.COUNT_SESSION_MANAGE,
    Permissions.COUNT_SESSION_READ,
    Permissions.COUNT_SESSION_ADJUST,
    Permissions.TRADE_READ,
    Permissions.APPROVAL_READ,
    Permissions.APPROVAL_REQUEST,
    Permissions.APPROVAL_REVIEW,
    Permissions.INTEGRATION_READ,
    Permissions.AI_ACTION_CONFIRM,
    Permissions.REPORT_STOCK_READ,
    Permissions.REPORT_SALES_READ,
    Permissions.REPORT_EMPLOYEE_READ,
    Permissions.REPORT_CUSTOMER_READ,
    Permissions.REPORT_INVENTORY_READ,
    Permissions.EXCHANGE_RATE_READ,
    Permissions.AI_CHAT,
  ],

  [UserRole.ADMIN]: [
    Permissions.STOCK_LIST_READ,
    Permissions.STOCK_MOVEMENTS_READ,
    Permissions.STOCK_LOW_ALERTS_READ,
    Permissions.STOCK_SUMMARY_READ,
    Permissions.STOCK_RECEIVE,
    Permissions.STOCK_TRANSFER,
    Permissions.STOCK_ADJUST,
    Permissions.SALE_CREATE,
    Permissions.SALE_READ,
    Permissions.SALE_UPDATE,
    Permissions.SALE_CANCEL,
    Permissions.SALE_RECEIPT_READ,
    Permissions.PRODUCT_READ,
    Permissions.PRODUCT_CREATE,
    Permissions.PRODUCT_UPDATE,
    Permissions.PRODUCT_DELETE,
    Permissions.PRODUCT_BARCODE_LOOKUP,
    Permissions.PRICE_READ,
    Permissions.PRICE_MANAGE,
    Permissions.STORE_READ,
    Permissions.STORE_CREATE,
    Permissions.STORE_UPDATE,
    Permissions.SUPPLIER_READ,
    Permissions.CUSTOMER_READ,
    Permissions.USER_READ,
    Permissions.USER_CREATE,
    Permissions.USER_UPDATE,
    Permissions.USER_STORE_ASSIGN,
    Permissions.TRADE_READ,
    Permissions.TRADE_MANAGE,
    Permissions.WAREHOUSE_MANAGE,
    Permissions.WAREHOUSE_READ,
    Permissions.COUNT_SESSION_MANAGE,
    Permissions.COUNT_SESSION_READ,
    Permissions.COUNT_SESSION_ADJUST,
    Permissions.REPORT_STOCK_READ,
    Permissions.REPORT_SALES_READ,
    Permissions.REPORT_FINANCIAL_READ,
    Permissions.REPORT_EMPLOYEE_READ,
    Permissions.REPORT_CUSTOMER_READ,
    Permissions.REPORT_INVENTORY_READ,
    Permissions.AUDIT_LOG_READ,
    Permissions.APPROVAL_READ,
    Permissions.APPROVAL_REQUEST,
    Permissions.APPROVAL_REVIEW,
    Permissions.APPROVAL_REVIEW_L2,
    Permissions.INTEGRATION_READ,
    Permissions.INTEGRATION_MANAGE,
    Permissions.AI_ACTION_CONFIRM,
    Permissions.EXCHANGE_RATE_READ,
    Permissions.EXCHANGE_RATE_MANAGE,
    Permissions.AI_CHAT,
  ],

  // OWNER her şeyi yapabilir
  [UserRole.OWNER]: Object.values(Permissions) as PermissionName[],
};
