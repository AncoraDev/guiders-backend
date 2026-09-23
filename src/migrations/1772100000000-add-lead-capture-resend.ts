import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeadCaptureResend1772100000000 implements MigrationInterface {
  name = 'AddLeadCaptureResend1772100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "lead_capture_resend_from" varchar(255) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "lead_capture_resend_api_key" text NOT NULL DEFAULT ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "lead_capture_resend_api_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "lead_capture_resend_from"`,
    );
  }
}
