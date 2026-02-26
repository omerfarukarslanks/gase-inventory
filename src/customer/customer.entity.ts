import { ContactBase } from 'src/common/entity/contact-base.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { Column, Entity, ManyToOne } from 'typeorm';

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

@Entity({ name: 'customers' })
export class Customer extends ContactBase {
  @ManyToOne(() => Tenant, { eager: true })
  tenant: Tenant;

  @Column({ nullable: true })
  country?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  district?: string;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender?: Gender;

  @Column({ type: 'date', nullable: true })
  birthDate?: string;
}
