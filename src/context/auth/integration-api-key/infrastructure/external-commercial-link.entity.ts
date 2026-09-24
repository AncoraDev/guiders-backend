import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('external_commercial_links')
@Index(
  'UQ_external_commercial_links_company_provider_external',
  ['companyId', 'provider', 'externalUserId'],
  { unique: true },
)
export class ExternalCommercialLinkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  companyId: string;

  @Column({ type: 'varchar', length: 32, default: 'leadcars' })
  provider: string;

  @Column({ type: 'varchar', length: 128 })
  externalUserId: string;

  @Column({ type: 'uuid' })
  userAccountId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
