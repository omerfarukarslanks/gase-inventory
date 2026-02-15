import { Column, Entity, ManyToOne, Unique } from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Attribute } from './attribute.entity';

@Entity({ name: 'attribute_values' })
@Unique(['attribute', 'name'])
@Unique(['attribute', 'value'])
export class AttributeValue extends AuditableEntity {
  @ManyToOne(() => Attribute, (attribute) => attribute.values, {
    onDelete: 'CASCADE',
  })
  attribute: Attribute;

  @Column()
  name: string;

  @Column('int')
  value: number;

  @Column({ default: true })
  isActive: boolean;
}
