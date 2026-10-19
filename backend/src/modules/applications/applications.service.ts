import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Application, ApplicationStatus } from './entities/application.entity';
import { ApplicationImage } from '../documents/entities/application-image.entity';
import { NextOfKin } from './entities/next-of-kin.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { CbsService } from '../cbs/cbs.service';

function pick(...values: any[]): any | undefined {
  return values.find((v) => v !== undefined && v !== null && String(v).trim() !== '');
}

function day(value: any): string | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  return String(value).slice(0, 10);
}

function lower(value: any): string | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  return String(value).toLowerCase().trim();
}

function sniffMime(buf: Buffer): string {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') return 'image/avif';
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  return 'application/octet-stream';
}

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application) private readonly repo: Repository<Application>,
    @InjectRepository(NextOfKin) private readonly nextOfKinRepo: Repository<NextOfKin>,
    @InjectRepository(ApplicationImage) private readonly imageRepo: Repository<ApplicationImage>,
    private readonly notifications: NotificationsService,
    private readonly cbs: CbsService,
  ) {}

  async findOneOrFail(id: string): Promise<Application> {
    const application = await this.repo.findOne({
      where: { id },
      relations: ['nextOfKin'],
    });
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  async listForAdmin(status?: ApplicationStatus) {
    return this.repo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      relations: ['nextOfKin'],
    });
  }

  async reject(id: string, adminId: string, reason: string) {
    const application = await this.findOneOrFail(id);
    application.status = ApplicationStatus.REJECTED;
    application.reviewedByAdminId = adminId;
    application.reviewedAt = new Date();
    application.rejectionReason = reason;
    const saved = await this.repo.save(application);

    // Let the member know the outcome and what to do next.
    if (this.notifications && application.phoneNumber) {
      this.notifications
        .notifyCustomer(
          application.phoneNumber,
          `Your Fortune Sacco membership application ${application.referenceNumber} was not approved. Reason: ${reason}. Please visit any branch for assistance.`,
          application.id,
          application.referenceNumber,
        )
        .catch(() => undefined);
    }
    return saved;
  }

  async syncFromCbs(cbsApplicationId: string): Promise<{ id: string }> {
    let payload: any | null;
    try {
      payload = await this.cbs.getApplication(cbsApplicationId);
    } catch (err) {
      throw new BadGatewayException(
        `CBS lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!payload) {
      throw new NotFoundException(`Application ${cbsApplicationId} not found in CBS`);
    }

    const cbsId = String(payload.applicationId || cbsApplicationId);
    const reference = pick(payload.appRef, payload.referenceNumber, cbsId);
    if (!reference) {
      throw new BadRequestException('CBS application has no reference number');
    }

    const existing = await this.matchExisting(payload, cbsId);
    const target = existing ?? this.repo.create();
    const locallyRejected = existing?.status === ApplicationStatus.REJECTED;

    const put = (key: keyof Application, value: any) => {
      if (value !== undefined && value !== null) (target as any)[key] = value;
    };

    put('cbsApplicationId', cbsId);
    put('referenceNumber', String(reference).trim());

    put('phoneNumber', pick(payload.phoneNumber));
    put('email', pick(payload.email));
    put('firstName', pick(payload.firstName));
    put('lastName', pick(payload.lastName));
    put('otherNames', pick(payload.middleName, payload.otherNames));
    put('sex', pick(payload.sex, payload.gender));
    put('dateOfBirth', day(payload.dateOfBirth));
    put('maritalStatus', lower(payload.maritalStatus));
    put('nearestBranch', pick(payload.nearestBranch));

    put('documentIdNumber', pick(payload.documentIdNumber, payload.idNumber));
    if (pick(payload.documentIdType)) {
      put('documentIdType', lower(payload.documentIdType));
    } else if (pick(payload.idNumber)) {
      put('documentIdType', 'national_id');
    }
    put('documentIssueDate', day(payload.documentIssueDate));
    put('documentExpiryDate', day(payload.documentExpiryDate));

    put('nationality', pick(payload.nationality));
    put('residenceEstate', pick(payload.residenceEstate, payload.addressLine2));
    put('physicalAddress', pick(payload.physicalAddress, payload.addressLine1));
    put('cityOrTown', pick(payload.cityOrTown, payload.city));
    put('countyOfResidence', pick(payload.countyOfResidence, payload.state, payload.district));
    put('countryOfResidence', pick(payload.countryOfResidence, payload.country));

    put('employmentStatus', lower(payload.employmentStatus));
    put('employerOrBusinessName', pick(payload.employerOrBusinessName, payload.employerName));
    put('employerLocation', pick(payload.employerLocation));
    put('professionOrDesignation', pick(payload.professionOrDesignation));
    put('employerPhone', pick(payload.employerPhone));
    put('workAddress', pick(payload.workAddress));
    put('approximateMonthlyIncome', pick(payload.approximateMonthlyIncome));

    put('accountType', pick(payload.accountType));
    put('selectedProducts', payload.selectedProducts);
    put('numberOfShares', payload.numberOfShares);
    put('standingOrderEnabled', payload.standingOrderEnabled);
    put('standingOrderAmount', payload.standingOrderAmount);
    put('standingOrderFrequency', lower(payload.standingOrderFrequency));

    put(
      'referredByStaff',
      payload.referredByStaff ?? (pick(payload.referralStaffNo, payload.referralStaffPfNumber) ? true : undefined),
    );
    put('referralStaffPfNumber', pick(payload.referralStaffPfNumber, payload.referralStaffNo));
    put('referralStaffName', pick(payload.referralStaffName, payload.referralName));

    put('alternativeMobileNumber', pick(payload.alternativeMobileNumber));
    put('businessName', pick(payload.businessName, payload.paybillBusinessName));
    const paybillAlerts = [
      payload.paybillAlertPhone,
      payload.paybillAlertPhone2,
      ...(Array.isArray(payload.businessPaybillNumbers) ? payload.businessPaybillNumbers : []),
    ].filter((v) => pick(v) !== undefined);
    if (paybillAlerts.length) put('businessPaybillNumbers', paybillAlerts);

    const services = new Set<string>(
      Array.isArray(payload.selectedServices) ? payload.selectedServices : [],
    );
    if (payload.internetBanking === true) services.add('internet_banking');
    if (payload.mobileBanking === true) services.add('mobile_banking');
    if (payload.paybill === true) services.add('business_paybill');
    if (services.size) put('selectedServices', [...services]);

    put('iprsVerified', payload.iprsVerified);
    put('mpesaReceiptNumber', pick(payload.mpesaReceiptNumber));
    put('amountPaid', pick(payload.amountPaid, payload.paymentAmount));
    if (pick(payload.mpesaReceiptNumber)) put('paymentCompleted', true);

    if (!locallyRejected && pick(payload.rejectionReason)) {
      put('rejectionReason', payload.rejectionReason);
    }

    const incomingStatus = this.toLocalStatus(payload.status);
    if (!locallyRejected && incomingStatus) put('status', incomingStatus);
    if (!target.status) target.status = ApplicationStatus.SUBMITTED;

    if (target.status !== ApplicationStatus.DRAFT && target.currentStep === undefined) {
      target.currentStep = 9;
    }
    if (!target.phoneVerified && pick(target.phoneNumber)) target.phoneVerified = true;
    if (!existing) {
      target.dataCollectionConsent = true;
      target.termsAccepted = true;
    }
    if (!target.submittedAt && (payload.submittedAt || payload.createdAt)) {
      const when = new Date(payload.submittedAt ?? payload.createdAt);
      if (!Number.isNaN(when.getTime())) target.submittedAt = when;
    }

    const saved = await this.repo.save(target);
    await this.syncNextOfKin(saved, payload);
    await this.syncImages(saved, payload);
    return { id: saved.id };
  }

  private async matchExisting(payload: any, cbsId: string): Promise<Application | null> {
    const attempts: FindOptionsWhere<Application>[] = [];
    if (cbsId) attempts.push({ cbsApplicationId: cbsId });

    const reference = pick(payload.appRef, payload.referenceNumber);
    if (reference) attempts.push({ referenceNumber: String(reference).trim() });

    const phone = pick(payload.phoneNumber);
    const idNumber = pick(payload.documentIdNumber, payload.idNumber);
    if (phone && idNumber) {
      attempts.push({ phoneNumber: String(phone), documentIdNumber: String(idNumber) });
    }
    if (phone) attempts.push({ phoneNumber: String(phone) });
    if (idNumber) attempts.push({ documentIdNumber: String(idNumber) });

    for (const where of attempts) {
      const rows = await this.repo.find({
        where,
        order: { updatedAt: 'DESC' },
        take: 1,
      });
      if (rows.length) return rows[0];
    }
    return null;
  }

  private toLocalStatus(raw: any): ApplicationStatus | null {
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    const value = String(raw).toLowerCase().trim();
    const known = Object.values(ApplicationStatus) as string[];
    return known.includes(value) ? (value as ApplicationStatus) : null;
  }

  private async syncNextOfKin(app: Application, payload: any) {
    const source: any[] =
      Array.isArray(payload.nominees) && payload.nominees.length
        ? payload.nominees
        : pick(payload.nomineeName)
          ? [
              {
                name: payload.nomineeName,
                relationship: payload.nomineeRelationship,
                mobileNumber: pick(payload.nomineeMobileNumber, payload.nomineePhone),
              },
            ]
          : [];

    const rows = source
      .filter((n) => n && pick(n.name))
      .map((n, index) =>
        this.nextOfKinRepo.create({
          applicationId: app.id,
          position: index + 1,
          name: String(n.name).trim(),
          relationship: String(pick(n.relationship) ?? 'Other').trim(),
          mobileNumber: String(
            pick(n.mobileNumber, n.mobile, app.phoneNumber) ?? 'NOT PROVIDED',
          ).trim(),
        }),
      );

    await this.nextOfKinRepo.delete({ applicationId: app.id });
    if (rows.length) {
      await this.nextOfKinRepo.save(rows);
      app.nextOfKinName = rows[0].name;
      app.nextOfKinRelationship = rows[0].relationship;
      app.nextOfKinMobileNumber = rows[0].mobileNumber;
      await this.repo.save(app);
    }
  }

  private async syncImages(app: Application, payload: any) {
    const kinds: Array<[string, string]> = [
      ['idFrontUrl', 'id_front'],
      ['idBackUrl', 'id_back'],
      ['passportUrl', 'passport_photo'],
      ['signatureUrl', 'signature'],
      ['selfieUrl', 'selfie'],
    ];

    for (const [key, kind] of kinds) {
      const raw = typeof payload[key] === 'string' ? payload[key] : '';
      const base64 = raw.startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw;
      if (base64.length < 100) continue;

      let data: Buffer;
      try {
        data = Buffer.from(base64, 'base64');
      } catch {
        continue;
      }
      if (!data.length) continue;

      await this.imageRepo.delete({ applicationId: app.id, kind });
      await this.imageRepo.save(
        this.imageRepo.create({
          applicationId: app.id,
          kind,
          mimeType: sniffMime(data),
          data,
        }),
      );
    }
  }
}
