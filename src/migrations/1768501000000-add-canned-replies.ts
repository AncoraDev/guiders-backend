import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCannedReplies1768501000000 implements MigrationInterface {
  name = 'AddCannedReplies1768501000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_account_entity" ADD COLUMN IF NOT EXISTS "cannedReplies" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "canned_replies" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_account_entity" DROP COLUMN IF EXISTS "cannedReplies"`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "canned_replies"`,
    );
  }
}
