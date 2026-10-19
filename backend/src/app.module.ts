import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApplicationsModule } from './modules/applications/applications.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { AdminModule } from './modules/admin/admin.module';
import { CbsModule } from './modules/cbs/cbs.module';

import { Application } from './modules/applications/entities/application.entity';
import { ApplicationImage } from './modules/documents/entities/application-image.entity';
import { AdminUser } from './modules/admin/entities/admin-user.entity';
import { NextOfKin } from './modules/applications/entities/next-of-kin.entity';
import { Notification } from './modules/notifications/entities/notification.entity';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL_SECONDS', 60) * 1000,
          limit: config.get<number>('THROTTLE_LIMIT', 30),
        },
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'oracle',
        host: config.get<string>('DB_HOST'),
        port: parseInt(config.get<string>('DB_PORT') || '1521', 10),
        serviceName: config.get<string>('DB_SERVICE'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        // Schema is per-entity (`@Entity({ schema: ... })`) — see typeorm.config.ts.
        poolSize: 10,
        entities: [
          Application,
          ApplicationImage,
          AdminUser,
          NextOfKin,
          Notification,
        ],
        // Schema is owned by the versioned Oracle baseline migration
        // (`npm run migration:run`), never auto-generated at boot.
        synchronize: false,
      }),
    }),
    ApplicationsModule,
    DocumentsModule,
    CbsModule,
    AdminModule,
    NotificationsModule,
  ],
})
export class AppModule {}
