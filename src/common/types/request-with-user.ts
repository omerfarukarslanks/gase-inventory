// src/common/types/request-with-user.ts
import { Request } from 'express';
import { User } from 'src/user/user.entity';

export interface RequestWithUser extends Request {
  user?: User; // JwtStrategy validate'den dönen user
}