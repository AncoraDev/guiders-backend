import { Column, Entity, PrimaryColumn, OneToMany } from 'typeorm';
import { CompanySiteTypeOrmEntity } from '../typeorm/company-site.entity';

// Entidad de persistencia para Company en TypeORM
@Entity('companies')
export class CompanyTypeOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'company_name', type: 'varchar', length: 255 })
  companyName: string;

  @OneToMany(() => CompanySiteTypeOrmEntity, (site) => site.company, {
    cascade: true,
    eager: true, // Cargar automáticamente los sites cuando se carga la company
  })
  sites: CompanySiteTypeOrmEntity[];

  @Column({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @Column({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @Column({
    name: 'canned_replies',
    type: 'jsonb',
    default: () => "'[]'",
  })
  cannedReplies: { id: string; title: string; body: string }[];

  @Column({
    name: 'contact_form_legal',
    type: 'jsonb',
    default: () => "'{}'",
  })
  contactFormLegal: {
    privacyPolicyUrl?: string;
    privacyCheckboxLabel?: string;
    marketingCheckboxLabel?: string;
  };

  @Column({
    name: 'lead_capture_notify_email',
    type: 'varchar',
    length: 255,
    default: '',
  })
  leadCaptureNotifyEmail: string;

  @Column({
    name: 'widget_config',
    type: 'jsonb',
    default: () => "'{}'",
  })
  widgetConfig: {
    chatEnabled?: boolean;
    autoOpenChatOnMessage?: boolean;
    colorScheme?: string;
    theme?: string;
    position?: {
      desktop?: string;
      mobileEnabled?: boolean;
      mobile?: string;
    };
  };
}
