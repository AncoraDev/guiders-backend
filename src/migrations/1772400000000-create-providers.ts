import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProviders1772400000000 implements MigrationInterface {
  name = 'CreateProviders1772400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "providers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "company_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_providers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_providers_company" UNIQUE ("company_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "providers"`);
  }
}
