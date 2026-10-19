import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AdminRole {
  SUPER_ADMIN = 'super_admin',
  REVIEWER = 'reviewer',
}

@Entity({ name: 'AP_ADMIN_USERS', schema: 'DIGITALSOLUTIONS' })
export class AdminUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column()
  fullName: string;

  @Column()
  passwordHash: string;

  @Column({ type: 'varchar2', length: 20, default: AdminRole.REVIEWER })
  role: AdminRole;

  @Column({ default: true })
  active: boolean;

  @Column({ default: true })
  mustChangePassword: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
