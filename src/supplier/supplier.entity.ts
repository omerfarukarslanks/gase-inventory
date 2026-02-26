import { ContactBase } from 'src/common/entity/contact-base.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { Entity, ManyToOne } from 'typeorm';

@Entity({ name: 'suppliers' })
export class Supplier extends ContactBase {
  @ManyToOne(() => Tenant, { eager: true })
  tenant: Tenant;
}
