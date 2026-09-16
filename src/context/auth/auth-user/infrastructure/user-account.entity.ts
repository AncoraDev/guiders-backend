import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class UserAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  password: string | null;

  @Column({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @Column({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  lastLoginAt: Date | null | undefined;

  @Column({
    type: 'simple-array',
    default: '',
  })
  roles: string[];

  @Column({ type: 'uuid', nullable: false })
  companyId: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'uuid', nullable: true, unique: true })
  keycloakId: string | null;

  @Column({ type: 'text', nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'text', nullable: true })
  greetingMessage: string | null;
}
