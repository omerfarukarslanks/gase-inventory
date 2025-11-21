import { Module } from '@nestjs/common';
import { TenantsService } from './tenant.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './tenant.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Tenant])],
    providers: [TenantsService],
    exports: [TenantsService],
})
export class TenantModule {}
