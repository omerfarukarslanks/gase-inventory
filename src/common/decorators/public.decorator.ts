import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Bu decorator ile işaretlenen endpoint'ler JWT doğrulamasından muaf tutulur.
 * Auth controller'daki login, signup gibi public endpoint'ler için kullanılır.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
