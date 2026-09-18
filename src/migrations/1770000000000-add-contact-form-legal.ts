import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactFormLegal1770000000000 implements MigrationInterface {
  name = 'AddContactFormLegal1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "contact_form_legal" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "contact_form_legal"`,
    );
  }
}
