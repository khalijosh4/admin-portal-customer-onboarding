import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { Application } from '../modules/applications/entities/application.entity';
import { ApplicationImage } from '../modules/documents/entities/application-image.entity';
import { AdminUser } from '../modules/admin/entities/admin-user.entity';
import { NextOfKin } from '../modules/applications/entities/next-of-kin.entity';
import { Notification } from '../modules/notifications/entities/notification.entity';

config();

// Standalone DataSource for the TypeORM CLI (`migration:*`) and seed scripts.
// Secrets come from backend/.env — never hardcode credentials here.
export default new DataSource({
  type: 'oracle',
  host: process.env.DB_HOST || '10.10.1.26',
  port: parseInt(process.env.DB_PORT || '1521', 10),
  serviceName: process.env.DB_SERVICE || 'FRTNPDB',
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  // No DataSource-level `schema`: TypeORM's MigrationExecutor would then read the
  // history table schema-qualified while OracleQueryRunner creates it unqualified
  // (in the session's current schema). The target schema is declared per-entity
  // instead (`@Entity({ schema: 'DIGITALSOLUTIONS' })`), which EntityMetadata
  // prioritizes and which schema-qualifies every DML statement.
  poolSize: 4,
  entities: [
    Application,
    ApplicationImage,
    AdminUser,
    NextOfKin,
    Notification,
  ],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
