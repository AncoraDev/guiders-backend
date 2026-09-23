import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeadCaptureNotifyEmail1772000000000
  implements MigrationInterface
{
  name = 'AddLeadCaptureNotifyEmail1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "lead_capture_notify_email" varchar(255) NOT NULL DEFAULT ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "lead_capture_notify_email"`,
    );
  }
}
