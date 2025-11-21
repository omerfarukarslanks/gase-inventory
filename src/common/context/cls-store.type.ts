// src/common/context/cls-store.type.ts
import { ClsStore } from 'nestjs-cls';

export interface AppClsStore extends ClsStore {
  correlationId: string;
  userId?: string;
  tenantId?: string;
  ip?: string;
  userAgent?: string;
}
