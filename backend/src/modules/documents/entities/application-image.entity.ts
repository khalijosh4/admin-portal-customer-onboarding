import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Binary store for the key member images (ID front/back, signature, passport
 * photo). Rows are written through from the document upload flow so reporting
 * and form generation can load images without touching the filesystem.
 */
@Entity({ name: 'AP_IMAGES', schema: 'DIGITALSOLUTIONS' })
export class ApplicationImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  applicationId: string;

  // Same values as DocumentKind: id_front | id_back | signature | passport_photo
  @Column()
  kind: string;

  @Column({ nullable: true })
  mimeType: string;

  @Column({ type: 'blob', nullable: true })
  data: Buffer;

  @CreateDateColumn()
  createdAt: Date;
}
