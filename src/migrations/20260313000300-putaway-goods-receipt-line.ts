import { MigrationInterface, QueryRunner } from 'typeorm';

export class PutawayGoodsReceiptLine20260313000300 implements MigrationInterface {
  name = 'PutawayGoodsReceiptLine20260313000300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "warehouse_putaway_tasks" ADD COLUMN IF NOT EXISTS "goodsReceiptLineId" uuid',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_putaway_goods_receipt_line" ON "warehouse_putaway_tasks" ("goodsReceiptLineId")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "idx_putaway_goods_receipt_line"',
    );
    await queryRunner.query(
      'ALTER TABLE "warehouse_putaway_tasks" DROP COLUMN IF EXISTS "goodsReceiptLineId"',
    );
  }
}
