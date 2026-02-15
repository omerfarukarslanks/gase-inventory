import { Column, Entity, ManyToOne, OneToMany, Unique } from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { AttributeValue } from './attribute-value.entity';

@Entity({ name: 'attributes' })
@Unique(['tenant', 'name'])
@Unique(['tenant', 'value'])
export class Attribute extends AuditableEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  name: string;

  @Column('int')
  value: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => AttributeValue, (item) => item.attribute, {
    cascade: true,
  })
  values: AttributeValue[];
}
