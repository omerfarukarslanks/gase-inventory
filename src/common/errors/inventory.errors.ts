export const InventoryErrors = {
  STORE_NOT_FOUND_FOR_TENANT: {
    code: 'INVENTORY_STORE_NOT_FOUND',
    message: 'Bu kuruma ait mağaza bulunamadı.',
  },
  VARIANT_NOT_FOUND_FOR_TENANT: {
    code: 'INVENTORY_VARIANT_NOT_FOUND',
    message: 'Bu kuruma ait ürün varyantı bulunamadı.',
  },
  NOT_ENOUGH_STOCK: {
    code: 'INVENTORY_NOT_ENOUGH_STOCK',
    message: 'Mağazada yeterli stok bulunmuyor.',
  },
  INVALID_QUANTITY: {
    code: 'INVENTORY_INVALID_QUANTITY',
    message: 'Miktar 0’dan büyük olmalıdır.',
  },
  SAME_SOURCE_AND_TARGET_STORE: {
    code: 'INVENTORY_SAME_SOURCE_AND_TARGET_STORE',
    message: 'Kaynak ve hedef mağaza aynı olamaz.',
  },
};