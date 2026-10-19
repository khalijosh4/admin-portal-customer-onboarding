import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationsService } from './applications.service';
import { Application } from './entities/application.entity';
import { NextOfKin } from './entities/next-of-kin.entity';
import { ApplicationImage } from '../documents/entities/application-image.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { CbsModule } from '../cbs/cbs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Application, NextOfKin, ApplicationImage]),
    NotificationsModule,
    CbsModule,
  ],
  providers: [ApplicationsService],
  exports: [ApplicationsService, TypeOrmModule],
})
export class ApplicationsModule {}
