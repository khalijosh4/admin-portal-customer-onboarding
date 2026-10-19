import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum NotificationAudience {
  ADMIN = 'admin',
  CUSTOMER = 'customer',
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  SMS = 'sms',
  EMAIL = 'email',
}

@Entity({ name: 'AP_NOTIFICATIONS', schema: 'DIGITALSOLUTIONS' })
@Index(['audience', 'readAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  audience: NotificationAudience;

  @Column()
  channel: NotificationChannel;

  // For admin notifications this is null (broadcast to all admins).
  // For customer notifications it holds the phone number the SMS went to.
  @Column({ nullable: true })
  recipient: string;

  @Index()
  @Column({ nullable: true })
  applicationId: string;

  @Column({ nullable: true })
  referenceNumber: string;

  @Column()
  title: string;

  @Column()
  body: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  readAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
