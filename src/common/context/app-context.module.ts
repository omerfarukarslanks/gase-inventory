// src/common/context/app-context.module.ts
import { Global, Module } from '@nestjs/common';
import { AppContextService } from './app-context.service';

@Global()
@Module({
  providers: [AppContextService],
  exports: [AppContextService],
})
export class AppContextModule {}
