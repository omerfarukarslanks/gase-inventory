// src/common/types/request-with-user.ts
import { Request } from 'express';
import { User } from 'src/user/user.entity';
import { StoreType } from 'src/common/constants/store-type.constants';

type AuthenticatedUser = User & {
  storeId?: string | null;
  storeType?: StoreType | null;
};

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser; // JwtStrategy validate'den dönen user
}
