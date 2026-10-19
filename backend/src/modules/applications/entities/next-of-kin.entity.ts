import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Application } from './application.entity';

@Entity({ name: 'AP_NEXT_OF_KIN', schema: 'DIGITALSOLUTIONS' })
export class NextOfKin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Application, (application) => application.nextOfKin, {
    onDelete: 'CASCADE',
  })
  application: Application;

  @Index()
  @Column()
  applicationId: string;

  // Order in which the nominee was entered by the member.
  @Column({ default: 1 })
  position: number;

  @Column()
  name: string;

  @Column()
  relationship: string;

  @Column()
  mobileNumber: string;

  @CreateDateColumn()
  createdAt: Date;
}
