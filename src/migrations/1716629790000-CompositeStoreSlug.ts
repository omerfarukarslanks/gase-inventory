import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompositeStoreSlug1716629790000 implements MigrationInterface {
  name = 'CompositeStoreSlug1716629790000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        constraint_name text;
      BEGIN
        SELECT tc.constraint_name INTO constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'store'
          AND tc.table_schema = current_schema()
          AND tc.constraint_type = 'UNIQUE'
          AND ccu.column_name = 'slug';

        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE "store" DROP CONSTRAINT %I', constraint_name);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "store"
      ADD CONSTRAINT "UQ_store_tenant_slug" UNIQUE ("tenantId", "slug");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "store" DROP CONSTRAINT IF EXISTS "UQ_store_tenant_slug";
    `);

    await queryRunner.query(`
      ALTER TABLE "store" ADD CONSTRAINT "UQ_store_slug" UNIQUE ("slug");
    `);
  }
}

