import { MigrationInterface, QueryRunner } from 'typeorm';

export class SalesCustomerId20260224000100 implements MigrationInterface {
  name = 'SalesCustomerId20260224000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "customerId" uuid',
    );
    await queryRunner.query(
      `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_sales_customerId_customers_id'
        ) THEN
          ALTER TABLE "sales"
          ADD CONSTRAINT "FK_sales_customerId_customers_id"
          FOREIGN KEY ("customerId") REFERENCES "customers"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_sales_customerId" ON "sales" ("customerId")',
    );

    await queryRunner.query('ALTER TABLE "sales" DROP COLUMN IF EXISTS "name"');
    await queryRunner.query('ALTER TABLE "sales" DROP COLUMN IF EXISTS "surname"');
    await queryRunner.query('ALTER TABLE "sales" DROP COLUMN IF EXISTS "phoneNumber"');
    await queryRunner.query('ALTER TABLE "sales" DROP COLUMN IF EXISTS "email"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "name" character varying',
    );
    await queryRunner.query(
      'ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "surname" character varying',
    );
    await queryRunner.query(
      'ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "phoneNumber" character varying',
    );
    await queryRunner.query(
      'ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "email" character varying',
    );

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_sales_customerId"');
    await queryRunner.query(
      'ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "FK_sales_customerId_customers_id"',
    );
    await queryRunner.query('ALTER TABLE "sales" DROP COLUMN IF EXISTS "customerId"');
  }
}
