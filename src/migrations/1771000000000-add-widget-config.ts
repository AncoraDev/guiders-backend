import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWidgetConfig1771000000000 implements MigrationInterface {
  name = 'AddWidgetConfig1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "widget_config" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "widget_config"`,
    );
  }
}
