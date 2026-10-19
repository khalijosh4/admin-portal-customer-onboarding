import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsService } from './documents.service';
import { ApplicationImage } from './entities/application-image.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ApplicationImage])],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
