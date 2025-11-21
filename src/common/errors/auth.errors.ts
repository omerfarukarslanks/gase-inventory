export const AuthErrors = {
  INVALID_CREDENTIALS: {
    code: 'AUTH_INVALID_CREDENTIALS',
    message: 'E-posta veya şifre hatalı.',
  },
  EMAIL_ALREADY_IN_USE: {
    code: 'AUTH_EMAIL_ALREADY_IN_USE',
    message: 'Bu e-posta adresiyle zaten bir kullanıcı kayıtlı.',
  },
  TENANT_INACTIVE: {
    code: 'AUTH_TENANT_INACTIVE',
    message: 'Bu kuruma ait hesap şu anda aktif değil.',
  },
  USER_INACTIVE: {
    code: 'AUTH_USER_INACTIVE',
    message: 'Kullanıcı hesabı aktif değil.',
  },
};
