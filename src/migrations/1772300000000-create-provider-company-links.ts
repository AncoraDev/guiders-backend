import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProviderCompanyLinks1772300000000
  implements MigrationInterface
{
  name = 'CreateProviderCompanyLinks1772300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "provider_company_links" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "providerCompanyId" uuid NOT NULL,
        "childCompanyId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_provider_company_links" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_provider_company_links_child" UNIQUE ("childCompanyId")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "provider_company_links"`);
  }
}
