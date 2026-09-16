import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGreetingMessageToUserAccount1768500000000
  implements MigrationInterface
{
  name = 'AddGreetingMessageToUserAccount1768500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_account_entity" ADD "greetingMessage" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_account_entity" DROP COLUMN "greetingMessage"`,
    );
  }
}
