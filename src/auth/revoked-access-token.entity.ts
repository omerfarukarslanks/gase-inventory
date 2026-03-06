import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Logout işleminde geçersiz kılınan access token'ların JTI listesi.
 * JwtStrategy her istekte bu tabloyu kontrol eder.
 * Süresi dolan token'lar periyodik cleanup ile temizlenir (veya lazy).
 */
@Entity({ name: 'revoked_access_tokens' })
export class RevokedAccessToken {
  /** JWT'nin jti claim'i (UUID) */
  @PrimaryColumn()
  jti: string;

  /** Token'ın orijinal exp zamanı — bu süre geçince kayıt silinebilir */
  @Index()
  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
