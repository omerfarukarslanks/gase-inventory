// src/common/utils/random-store-name.ts

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Tenant adına göre, basit ve okunabilir bir mağaza ismi üretir.
 * Örn: "Arslan Tekstil" → "Arslan Tekstil Merkez Mağaza"
 */
export function generateRandomStoreName(tenantName?: string): string {
  const prefixes = [
    'Merkez',
    'Ana',
    '1. Şube',
    '2. Şube',
    'Depo',
    'Outlet',
    'Express',
    'Online',
  ];

  const suffixes = [
    'Mağaza',
    'Şube',
    'Depo',
    'Store',
    'Satış Noktası',
  ];

  const base =
    (tenantName ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2) // çok uzun isimleri kısalt
      .join(' ') || 'Mağaza';

  const prefix = pickRandom(prefixes);
  const suffix = pickRandom(suffixes);

  // Örnek çıktılar:
  // "Arslan Tekstil Merkez Mağaza"
  // "Arslan Tekstil Depo Store"
  // "Mağaza Express Depo"
  return `${base} ${prefix} ${suffix}`.trim();
}
