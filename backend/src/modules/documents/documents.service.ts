import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplicationImage } from './entities/application-image.entity';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(ApplicationImage)
    private readonly imageRepo: Repository<ApplicationImage>,
  ) {}

  // Latest stored binary per kind, used by the printable membership form.
  async getImageBinary(applicationId: string, kind: string): Promise<{ data: Buffer; mimeType: string } | null> {
    const row = await this.imageRepo.findOne({ where: { applicationId, kind } });
    if (row?.data) return { data: Buffer.from(row.data), mimeType: row.mimeType };
    return null;
  }
}
