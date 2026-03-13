import { MigrationInterface, QueryRunner } from 'typeorm';

export class GoodsReceiptWarehouse20260313000200 implements MigrationInterface {
  name = 'GoodsReceiptWarehouse20260313000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "warehouseId" uuid',
    );

    await queryRunner.query(
      `UPDATE "goods_receipts" gr
       SET "warehouseId" = w.id
       FROM "warehouses" w
       WHERE gr."warehouseId" IS NULL
         AND w."tenantId" = gr."tenantId"
         AND w."storeId" = gr."storeId"
         AND w."isActive" = true
         AND 1 = (
           SELECT COUNT(*)
           FROM "warehouses" w2
           WHERE w2."tenantId" = gr."tenantId"
             AND w2."storeId" = gr."storeId"
             AND w2."isActive" = true
         )`,
    );

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_goods_receipts_warehouse" ON "goods_receipts" ("warehouseId")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "idx_goods_receipts_warehouse"',
    );
    await queryRunner.query(
      'ALTER TABLE "goods_receipts" DROP COLUMN IF EXISTS "warehouseId"',
    );
  }
}
