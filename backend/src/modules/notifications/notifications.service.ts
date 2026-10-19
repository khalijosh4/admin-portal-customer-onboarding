import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AdvantaSmsService } from './advanta-sms.service';
import { EmailService } from './email.service';
import {
  Notification,
  NotificationAudience,
  NotificationChannel,
} from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    private readonly sms: AdvantaSmsService,
    private readonly email: EmailService,
  ) {}

  // Send an SMS to the member and keep a record of what was sent.
  async notifyCustomer(phoneNumber: string, message: string, applicationId?: string, referenceNumber?: string) {
    const sent = await this.sms.sendSms(phoneNumber, message);
    return this.repo.save(
      this.repo.create({
        audience: NotificationAudience.CUSTOMER,
        channel: NotificationChannel.SMS,
        recipient: phoneNumber,
        title: 'SMS to customer',
        body: message,
        applicationId,
        referenceNumber,
      }),
    ).then((n) => ({ notification: n, smsSent: sent }));
  }

  listForAdmin(limit = 50) {
    return this.repo.find({
      where: { audience: NotificationAudience.ADMIN },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  unreadCount() {
    return this.repo.count({
      where: { audience: NotificationAudience.ADMIN, readAt: IsNull() },
    });
  }

  /**
   * Send a notification to a customer (SMS and/or email), optionally from a
   * predefined template, and keep a record of what was sent.
   *
   * channel: 'sms' | 'email' | 'both'
   * subject: required for email; ignored for sms
   */
  async sendToCustomer(input: {
    phoneNumber?: string;
    email?: string;
    channel: 'sms' | 'email' | 'both';
    subject?: string;
    body: string;
    templateId?: string;
    applicationId?: string;
    referenceNumber?: string;
  }): Promise<{
    smsSent?: boolean;
    emailSent?: boolean;
    sms?: Notification;
    email?: Notification;
  }> {
    const results: { smsSent?: boolean; emailSent?: boolean; sms?: Notification; email?: Notification } = {};

    if (input.channel === 'sms' || input.channel === 'both') {
      if (!input.phoneNumber) throw new BadRequestException('phoneNumber is required for SMS notifications');
      const sent = await this.sms.sendSms(input.phoneNumber, input.body);
      results.smsSent = sent;
      results.sms = await this.repo.save(
        this.repo.create({
          audience: NotificationAudience.CUSTOMER,
          channel: NotificationChannel.SMS,
          recipient: input.phoneNumber,
          title: input.templateId ? `SMS to customer (${input.templateId})` : 'SMS to customer',
          body: input.body,
          applicationId: input.applicationId,
          referenceNumber: input.referenceNumber,
        }),
      );
    }

    if (input.channel === 'email' || input.channel === 'both') {
      if (!input.email) throw new BadRequestException('email is required for email notifications');
      const subject = input.subject || 'Fortune Sacco';
      const htmlBody = this.wrapEmailHtml(input.body);
      const sent = await this.email.sendGeneralEmail(input.email, subject, htmlBody, input.body);
      results.emailSent = sent;
      results.email = await this.repo.save(
        this.repo.create({
          audience: NotificationAudience.CUSTOMER,
          channel: NotificationChannel.EMAIL,
          recipient: input.email,
          title: subject,
          body: input.body,
          applicationId: input.applicationId,
          referenceNumber: input.referenceNumber,
        }),
      );
    }

    return results;
  }

  /** Predefined customer notification templates with placeholder tokens. */
  listTemplates() {
    return TEMPLATES;
  }

  private wrapEmailHtml(body: string): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
        <div style="background:#1a4731;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">Fortune Sacco</h2>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
          <p style="font-size:15px;color:#333;white-space:pre-wrap;">${body}</p>
        </div>
      </div>`;
  }

  async markRead(id: string) {
    await this.repo.update(id, { readAt: new Date() });
    return { ok: true };
  }

  async markAllRead() {
    await this.repo
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: new Date() })
      .where('readAt IS NULL AND audience = :audience', { audience: NotificationAudience.ADMIN })
      .execute();
    return { ok: true };
  }
}

export interface NotificationTemplate {
  id: string;
  name: string;
  description: string;
  /** Whether the template body is for SMS, email, or both. */
  channel: 'sms' | 'email' | 'both';
  subject?: string;
  body: string;
}

export const TEMPLATES: NotificationTemplate[] = [
  {
    id: 'application-received',
    name: 'Application received',
    description: 'Confirm that the membership application has been received and is under review.',
    channel: 'both',
    subject: 'Your Fortune Sacco application has been received',
    body: 'Dear {firstName}, thank you for applying to Fortune Sacco. Your application {reference} has been received and is under review.',
  },
  {
    id: 'application-approved',
    name: 'Application approved',
    description: 'Notify the member that their application was approved and share their customer number.',
    channel: 'both',
    subject: 'Congratulations! Your Fortune Sacco application was approved',
    body: 'Dear {firstName}, congratulations! Your Fortune Sacco membership application {reference} has been approved. Your customer number is {customerNumber}.',
  },
  {
    id: 'application-rejected',
    name: 'Application rejected',
    description: 'Notify the member that their application was not approved.',
    channel: 'both',
    subject: 'Update on your Fortune Sacco application',
    body: 'Dear {firstName}, we regret to inform you that your Fortune Sacco membership application {reference} was not approved. Reason: {reason}. Please visit any branch for assistance.',
  },
  {
    id: 'payment-confirmation',
    name: 'Payment confirmation',
    description: 'Confirm a payment was received and the application was sent for review.',
    channel: 'both',
    subject: 'Fortune Sacco payment received',
    body: 'Dear {firstName}, payment of KES {amount} received. Your membership application {reference} has been sent for review.',
  },
  {
    id: 'document-request',
    name: 'Request documents',
    description: 'Ask the member to submit additional or corrected documents.',
    channel: 'both',
    subject: 'Action required: additional documents',
    body: 'Dear {firstName}, we need additional documents to complete your Fortune Sacco application {reference}. Please visit any branch or submit them online.',
  },
  {
    id: 'branch-visit',
    name: 'Visit branch',
    description: 'Invite the member to visit a branch to complete their onboarding.',
    channel: 'both',
    subject: 'Visit a Fortune Sacco branch',
    body: 'Dear {firstName}, please visit your nearest Fortune Sacco branch to complete your membership application {reference}.',
  },
];
