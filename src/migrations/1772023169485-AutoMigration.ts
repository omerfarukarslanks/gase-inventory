import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1772023169485 implements MigrationInterface {
    name = 'AutoMigration1772023169485'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_package_items" DROP COLUMN "quantity"`);
        await queryRunner.query(`ALTER TABLE "product_package_items" ADD "quantity" integer NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_package_items" DROP COLUMN "quantity"`);
        await queryRunner.query(`ALTER TABLE "product_package_items" ADD "quantity" numeric(12,4) NOT NULL`);
    }

}
