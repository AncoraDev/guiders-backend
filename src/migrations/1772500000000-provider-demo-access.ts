import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderDemoAccess1772500000000 implements MigrationInterface {
  name = 'ProviderDemoAccess1772500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "providers"
        ADD COLUMN IF NOT EXISTS "access_token" text NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "demo_admin_email" varchar(255) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "demo_admin_password" text NOT NULL DEFAULT ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "providers"
        DROP COLUMN IF EXISTS "demo_admin_password",
        DROP COLUMN IF EXISTS "demo_admin_email",
        DROP COLUMN IF EXISTS "access_token"
    `);
  }
}
