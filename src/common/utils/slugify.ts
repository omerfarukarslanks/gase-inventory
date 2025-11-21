// src/common/utils/slugify.ts
const TR_CHAR_MAP: Record<string, string> = {
  'ş': 's', 'Ş': 's',
  'ı': 'i', 'İ': 'i',
  'ç': 'c', 'Ç': 'c',
  'ğ': 'g', 'Ğ': 'g',
  'ü': 'u', 'Ü': 'u',
  'ö': 'o', 'Ö': 'o',
};

export function slugify(input: string): string {
  if (!input) return '';

  // Trim & Türkçe karakter dönüştürme
  let str = input.trim();

  str = str
    .split('')
    .map((ch) => TR_CHAR_MAP[ch] ?? ch) // Türkçe map
    .join('');

  // Unicode accent vs. varsa temizle (NFD + combining marks)
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Küçük harfe çevir
  str = str.toLowerCase();

  // Harf, rakam dışında kalan her şeyi tire yap
  str = str.replace(/[^a-z0-9]+/g, '-');

  // Birden fazla tireyi teke indir
  str = str.replace(/-+/g, '-');

  // Baş ve sondaki tireleri kırp
  str = str.replace(/^-|-$/g, '');

  return str;
}
