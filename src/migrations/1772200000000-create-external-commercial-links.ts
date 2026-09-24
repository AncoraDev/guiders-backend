import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExternalCommercialLinks1772200000000
  implements MigrationInterface
{
  name = 'CreateExternalCommercialLinks1772200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "external_commercial_links" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "companyId" uuid NOT NULL,
        "provider" character varying(32) NOT NULL DEFAULT 'leadcars',
        "externalUserId" character varying(128) NOT NULL,
        "userAccountId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_external_commercial_links" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_external_commercial_links_company_provider_external"
          UNIQUE ("companyId", "provider", "externalUserId")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "external_commercial_links"`);
  }
}
