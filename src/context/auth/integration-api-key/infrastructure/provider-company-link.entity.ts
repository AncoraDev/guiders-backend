import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('provider_company_links')
@Index('UQ_provider_company_links_child', ['childCompanyId'], { unique: true })
export class ProviderCompanyLinkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  providerCompanyId: string;

  @Column({ type: 'uuid' })
  childCompanyId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
