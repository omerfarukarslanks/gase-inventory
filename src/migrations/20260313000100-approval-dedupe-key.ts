import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApprovalDedupeKey20260313000100 implements MigrationInterface {
  name = 'ApprovalDedupeKey20260313000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "approval_requests" ADD COLUMN IF NOT EXISTS "dedupeKey" character varying(255)',
    );

    await queryRunner.query(
      `UPDATE "approval_requests"
       SET "dedupeKey" = CASE
         WHEN "entityType" IN ('PURCHASE_ORDER', 'SALE_RETURN', 'COUNT_ADJUSTMENT')
           AND "entityId" IS NOT NULL
           THEN "entityType" || ':' || "entityId"::text
         WHEN "entityType" IN ('STOCK_ADJUSTMENT', 'PRICE_OVERRIDE')
           THEN "entityType" || ':' || COALESCE("requestData"->>'storeId', '') || ':' || COALESCE("requestData"->>'productVariantId', '')
         ELSE "dedupeKey"
       END
       WHERE "dedupeKey" IS NULL`,
    );

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_approval_tenant_dedupe_status" ON "approval_requests" ("tenantId", "dedupeKey", "status")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "idx_approval_tenant_dedupe_status"',
    );
    await queryRunner.query(
      'ALTER TABLE "approval_requests" DROP COLUMN IF EXISTS "dedupeKey"',
    );
  }
}
