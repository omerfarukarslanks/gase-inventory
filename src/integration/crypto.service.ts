import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as nodeCrypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES  = 32;
const IV_BYTES   = 12;
const TAG_BYTES  = 16;

/**
 * AES-256-GCM ile simetrik şifreleme/çözme.
 *
 * Gerekli env:
 *   INTEGRATION_ENCRYPTION_KEY — 64 karakter hex (32 byte)
 *
 * DB'de saklanan format (JSONB içinde):
 *   { __encrypted: true, iv: string, tag: string, data: string }
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    const hex = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!hex || hex.length !== KEY_BYTES * 2) {
      throw new InternalServerErrorException(
        'INTEGRATION_ENCRYPTION_KEY env değişkeni 64 karakter hex olarak ayarlanmalıdır.',
      );
    }
    this.key = Buffer.from(hex, 'hex');
  }

  encrypt(plain: Record<string, any>): Record<string, any> {
    const iv  = nodeCrypto.randomBytes(IV_BYTES);
    const cipher = nodeCrypto.createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: TAG_BYTES,
    }) as nodeCrypto.CipherGCM;

    const json   = JSON.stringify(plain);
    const data   = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
    const tag    = cipher.getAuthTag();

    return {
      __encrypted: true,
      iv:   iv.toString('base64'),
      tag:  tag.toString('base64'),
      data: data.toString('base64'),
    };
  }

  decrypt(stored: Record<string, any>): Record<string, any> {
    if (!stored.__encrypted) return stored; // şifrelenmemiş eski veri

    const iv     = Buffer.from(stored.iv as string,   'base64');
    const tag    = Buffer.from(stored.tag as string,  'base64');
    const data   = Buffer.from(stored.data as string, 'base64');

    const decipher = nodeCrypto.createDecipheriv(ALGORITHM, this.key, iv, {
      authTagLength: TAG_BYTES,
    }) as nodeCrypto.DecipherGCM;
    decipher.setAuthTag(tag);

    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  }
}
