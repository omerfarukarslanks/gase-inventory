import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductIdToProductPackageItems1772091800000 implements MigrationInterface {
  name = 'AddProductIdToProductPackageItems1772091800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_package_items" ADD COLUMN IF NOT EXISTS "productId" uuid`,
    );

    await queryRunner.query(
      `UPDATE "product_package_items" ppi
       SET "productId" = pv."productId"
       FROM "product_variants" pv
       WHERE ppi."productVariantId" = pv."id"
         AND ppi."productId" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "product_package_items" ALTER COLUMN "productId" SET NOT NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_package_items_productId" ON "product_package_items" ("productId")`,
    );

    await queryRunner.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1
           FROM pg_constraint
           WHERE conname = 'FK_product_package_items_productId_products_id'
         ) THEN
           ALTER TABLE "product_package_items"
           ADD CONSTRAINT "FK_product_package_items_productId_products_id"
           FOREIGN KEY ("productId") REFERENCES "products"("id")
           ON DELETE RESTRICT ON UPDATE NO ACTION;
         END IF;
       END $$;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_package_items" DROP CONSTRAINT IF EXISTS "FK_product_package_items_productId_products_id"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_package_items_productId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "product_package_items" DROP COLUMN IF EXISTS "productId"`,
    );
  }
}
