// src/common/types/request-with-user.ts
import { Request } from 'express';
import { User } from 'src/user/user.entity';

type AuthenticatedUser = User & { storeId?: string | null };

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser; // JwtStrategy validate'den dönen user
}
