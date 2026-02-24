export enum SupportedCurrency {
  TRY = 'TRY',
  USD = 'USD',
  EUR = 'EUR',
}

export const FOREIGN_CURRENCIES = [SupportedCurrency.USD, SupportedCurrency.EUR] as const;
