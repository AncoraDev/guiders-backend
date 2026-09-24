import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('providers')
export class ProviderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid', unique: true })
  companyId: string;

  @Column({ name: 'access_token', type: 'text', default: '' })
  accessToken: string;

  @Column({ name: 'demo_admin_email', type: 'varchar', length: 255, default: '' })
  demoAdminEmail: string;

  @Column({ name: 'demo_admin_password', type: 'text', default: '' })
  demoAdminPassword: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
