import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Optimistic concurrency conflict için standart 409 yanıt modeli.
 *
 * Kullanım:
 *   throw new ConflictDataException(serverSideEntity, 'Kayıt güncellendi');
 *
 * Client bu yanıtı alınca serverVersion'ı ekranda göstererek kullanıcıdan
 * kararı (server_wins / client_wins / manual merge) bekler.
 */
export class ConflictDataException extends HttpException {
  constructor(serverVersion: Record<string, any>, message = 'Kayıt başka bir istem tarafından güncellendi') {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message,
        serverVersion,
      },
      HttpStatus.CONFLICT,
    );
  }
}
