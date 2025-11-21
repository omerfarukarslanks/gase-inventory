export const SalesErrors = {
  SALE_NOT_FOUND: {
    code: 'SALE_NOT_FOUND',
    message: 'Satış fişi bulunamadı.',
  },
  SALE_ALREADY_CANCELLED: {
    code: 'SALE_ALREADY_CANCELLED',
    message: 'Bu satış zaten iptal edilmiş.',
  },
  SALE_STATUS_NOT_CONFIRMABLE: {
    code: 'SALE_STATUS_NOT_CONFIRMABLE',
    message: 'Sadece onaylanmış satışlar iptal edilebilir.',
  },
  SALE_MUST_HAVE_LINES: {
    code: 'SALE_MUST_HAVE_LINES',
    message: 'Satış fişinde en az bir satır bulunmalıdır.',
  },
};
