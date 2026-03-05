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
  SALE_PAYMENT_MANAGE:  'SALE_PAYMENT_MANAGE',
  SALE_LINE_MANAGE:     'SALE_LINE_MANAGE',
  SALE_RETURN:          'SALE_RETURN',
  SALE_RECEIPT_READ:    'SALE_RECEIPT_READ',

  // ─── Ürün ───────────────────────────────────────────
  PRODUCT_READ:             'PRODUCT_READ',
  PRODUCT_CREATE:           'PRODUCT_CREATE',
  PRODUCT_UPDATE:           'PRODUCT_UPDATE',
  PRODUCT_DELETE:           'PRODUCT_DELETE',

  PRODUCT_VARIANT_CREATE:   'PRODUCT_VARIANT_CREATE',
  PRODUCT_VARIANT_UPDATE:   'PRODUCT_VARIANT_UPDATE',

  PRODUCT_BARCODE_LOOKUP:   'PRODUCT_BARCODE_LOOKUP',
  PRODUCT_CATEGORY_MANAGE:  'PRODUCT_CATEGORY_MANAGE',
  PRODUCT_PACKAGE_MANAGE:   'PRODUCT_PACKAGE_MANAGE',

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

  // ─── Kullanıcı ──────────────────────────────────────
  USER_READ:         'USER_READ',
  USER_CREATE:       'USER_CREATE',
  USER_UPDATE:       'USER_UPDATE',
  USER_DELETE:       'USER_DELETE',
  USER_STORE_ASSIGN: 'USER_STORE_ASSIGN',

  // ─── Tedarikçi ──────────────────────────────────────
  SUPPLIER_READ:   'SUPPLIER_READ',
  SUPPLIER_MANAGE: 'SUPPLIER_MANAGE',

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

  // ─── Sistem ─────────────────────────────────────────
  EXCHANGE_RATE_READ: 'EXCHANGE_RATE_READ',
  AI_CHAT:            'AI_CHAT',
  PERMISSION_MANAGE:  'PERMISSION_MANAGE',
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
  SALE_PAYMENT_MANAGE:  { group: 'Satış', description: 'Ödeme kaydı ekleme/düzenleme/silme' },
  SALE_LINE_MANAGE:     { group: 'Satış', description: 'Satış satırı ekleme/güncelleme/silme' },
  SALE_RETURN:          { group: 'Satış', description: 'Kısmi iade oluşturma' },
  SALE_RECEIPT_READ:    { group: 'Satış', description: 'Satış fişi PDF indirme' },

  PRODUCT_READ:             { group: 'Ürün', description: 'Ürün/varyant listeleme ve görüntüleme' },
  PRODUCT_CREATE:           { group: 'Ürün', description: 'Yeni ürün oluşturma' },
  PRODUCT_UPDATE:           { group: 'Ürün', description: 'Ürün/varyant güncelleme' },
  PRODUCT_DELETE:           { group: 'Ürün', description: 'Ürün/varyant silme (pasife alma)' },
  
  PRODUCT_VARIANT_CREATE:   { group: 'Ürün', description: 'Ürün varyantı oluşturma' },
  PRODUCT_VARIANT_UPDATE:   { group: 'Ürün', description: 'Ürün varyantı güncelleme' },



  PRODUCT_BARCODE_LOOKUP:   { group: 'Ürün', description: 'Barkod ile ürün arama' },
  PRODUCT_CATEGORY_MANAGE:  { group: 'Ürün', description: 'Ürün kategorisi yönetimi' },
  PRODUCT_PACKAGE_MANAGE:   { group: 'Ürün', description: 'Ürün paketi yönetimi' },

  PRODUCT_ATTRIBUTE_READ: { group: 'Ürün', description: 'Ürün özelliği(attribute) listeleme'},
  PRODUCT_ATTRIBUTE_UPDATE: { group: 'Ürün', description: 'Ürün özelliği (attribute) güncelleme'},
  PRODUCT_ATTRIBUTE_CREATE: { group: 'Ürün', description: 'Ürün özelliği (attribute) oluşturma'},


  PRICE_READ:   { group: 'Fiyat', description: 'Mağaza fiyatlarını görüntüleme' },
  PRICE_MANAGE: { group: 'Fiyat', description: 'Mağaza bazlı fiyat/vergi/indirim tanımlama' },

  STORE_READ:   { group: 'Mağaza', description: 'Mağaza bilgilerini görüntüleme' },
  STORE_CREATE: { group: 'Mağaza', description: 'Yeni mağaza oluşturma' },
  STORE_UPDATE: { group: 'Mağaza', description: 'Mağaza bilgilerini güncelleme' },
  STORE_DELETE: { group: 'Mağaza', description: 'Mağazayı pasife alma (soft delete)' },

  USER_READ:         { group: 'Kullanıcı', description: 'Kullanıcı listeleme ve görüntüleme' },
  USER_CREATE:       { group: 'Kullanıcı', description: 'Yeni kullanıcı oluşturma' },
  USER_UPDATE:       { group: 'Kullanıcı', description: 'Kullanıcı bilgileri güncelleme' },
  USER_DELETE:       { group: 'Kullanıcı', description: 'Kullanıcıyı pasife alma' },
  USER_STORE_ASSIGN: { group: 'Kullanıcı', description: 'Kullanıcıya mağaza atama / çıkarma' },

  SUPPLIER_READ:   { group: 'Tedarikçi', description: 'Tedarikçi listeleme ve görüntüleme' },
  SUPPLIER_MANAGE: { group: 'Tedarikçi', description: 'Tedarikçi oluşturma/güncelleme/silme' },

  CUSTOMER_READ:   { group: 'Müşteri', description: 'Müşteri listeleme, görüntüleme ve bakiye' },
  CUSTOMER_CREATE: { group: 'Müşteri', description: 'Müşteri oluşturma' },
  CUSTOMER_UPDATE: { group: 'Müşteri', description: 'Müşteri güncelleme' },

  REPORT_STOCK_READ:     { group: 'Raporlar', description: 'Stok raporlarını görüntüleme' },
  REPORT_SALES_READ:     { group: 'Raporlar', description: 'Satış raporlarını görüntüleme' },
  REPORT_FINANCIAL_READ: { group: 'Raporlar', description: 'Finansal raporları görüntüleme' },
  REPORT_EMPLOYEE_READ:  { group: 'Raporlar', description: 'Çalışan raporlarını görüntüleme' },
  REPORT_CUSTOMER_READ:  { group: 'Raporlar', description: 'Müşteri raporlarını görüntüleme' },
  REPORT_INVENTORY_READ: { group: 'Raporlar', description: 'Envanter/stok analiz raporları' },

  EXCHANGE_RATE_READ: { group: 'Sistem', description: 'Döviz kurlarını görüntüleme' },
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
    Permissions.SALE_PAYMENT_MANAGE,
    Permissions.SALE_LINE_MANAGE,
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
    Permissions.SALE_PAYMENT_MANAGE,
    Permissions.SALE_LINE_MANAGE,
    Permissions.SALE_RETURN,
    Permissions.SALE_RECEIPT_READ,
    Permissions.PRODUCT_READ,
    Permissions.PRODUCT_CREATE,
    Permissions.PRODUCT_UPDATE,
    Permissions.PRODUCT_BARCODE_LOOKUP,
    Permissions.PRODUCT_CATEGORY_MANAGE,
    Permissions.PRODUCT_PACKAGE_MANAGE,
    Permissions.PRICE_READ,
    Permissions.SUPPLIER_READ,
    Permissions.CUSTOMER_READ,
    Permissions.STORE_READ,
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
    Permissions.SALE_PAYMENT_MANAGE,
    Permissions.SALE_LINE_MANAGE,
    Permissions.SALE_RETURN,
    Permissions.SALE_RECEIPT_READ,
    Permissions.PRODUCT_READ,
    Permissions.PRODUCT_CREATE,
    Permissions.PRODUCT_UPDATE,
    Permissions.PRODUCT_DELETE,
    Permissions.PRODUCT_BARCODE_LOOKUP,
    Permissions.PRODUCT_CATEGORY_MANAGE,
    Permissions.PRODUCT_PACKAGE_MANAGE,
    Permissions.PRICE_READ,
    Permissions.PRICE_MANAGE,
    Permissions.STORE_READ,
    Permissions.STORE_CREATE,
    Permissions.STORE_UPDATE,
    Permissions.SUPPLIER_READ,
    Permissions.SUPPLIER_MANAGE,
    Permissions.CUSTOMER_READ,
    Permissions.USER_READ,
    Permissions.USER_CREATE,
    Permissions.USER_UPDATE,
    Permissions.USER_STORE_ASSIGN,
    Permissions.REPORT_STOCK_READ,
    Permissions.REPORT_SALES_READ,
    Permissions.REPORT_FINANCIAL_READ,
    Permissions.REPORT_EMPLOYEE_READ,
    Permissions.REPORT_CUSTOMER_READ,
    Permissions.REPORT_INVENTORY_READ,
    Permissions.EXCHANGE_RATE_READ,
    Permissions.AI_CHAT,
  ],

  // OWNER her şeyi yapabilir
  [UserRole.OWNER]: Object.values(Permissions) as PermissionName[],
};
