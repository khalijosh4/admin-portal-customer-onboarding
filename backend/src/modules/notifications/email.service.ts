import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * SMTP mailer used by the admin portal for customer/admin notifications.
 * (Historically named EmailOtpService in the onboarding project; the OTP
 * flows were removed in the admin-portal cut-down, the generic mailer stays.)
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const mode = this.config.get<string>('EMAIL_MODE', 'dev');
    if (mode === 'live') {
      const secureValue = this.config.get<string>('EMAIL_SECURE', 'false');
      const secure = secureValue === 'true';
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('EMAIL_HOST'),
        port: Number(this.config.get<number>('EMAIL_PORT', 587)),
        secure,
        auth: {
          user: this.config.get<string>('EMAIL_USER'),
          pass: this.config.get<string>('EMAIL_PASSWORD'),
        },
        // If the server does not offer STARTTLS cleanly, still allow sending
        // over the opportunistic STARTTLS upgrade (port 587 default).
        requireTLS: true,
      });
      this.logger.log(
        `Email transporter initialised (live mode, port=${this.config.get('EMAIL_PORT')}, secure=${secure})`,
      );
    }
  }

  async sendGeneralEmail(to: string, subject: string, htmlBody: string, textBody: string): Promise<boolean> {
    const from = this.config.get<string>('EMAIL_FROM', 'noreply@fortune.co.ke');
    const fromName = this.config.get<string>('EMAIL_FROM_NAME', 'Fortune Sacco');

    if (!this.transporter) {
      this.logger.warn(`[DEV MODE] Would send email to ${to}: "${subject}"`);
      return true;
    }
    try {
      await this.transporter.sendMail({
        from: `"${fromName}" <${from}>`,
        to,
        subject,
        text: textBody,
        html: htmlBody,
      });
      this.logger.log(`Email sent to ${to}: "${subject}"`);
      return true;
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
      return false;
    }
  }
}
