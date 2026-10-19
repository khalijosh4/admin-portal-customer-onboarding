import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { normalizeKenyanPhone } from '../../common/phone.util';

/**
 * Thin wrapper around the Advanta Africa Ltd Bulk SMS API.
 * Docs (typical Advanta integration): https://quicksms.advantasms.com
 *
 * Fill ADVANTA_API_KEY / ADVANTA_PARTNER_ID / ADVANTA_SHORTCODE in your .env
 * (obtained from your Advanta Africa account dashboard) to send live SMS.
 * Until then, this service logs the message to the console so you can keep
 * developing the onboarding flow end-to-end without live credentials.
 */
@Injectable()
export class AdvantaSmsService {
  private readonly logger = new Logger(AdvantaSmsService.name);

  constructor(private readonly config: ConfigService) {}

  async sendSms(phoneNumber: string, message: string): Promise<boolean> {
    const apiKey = this.config.get<string>('ADVANTA_API_KEY');
    const partnerId = this.config.get<string>('ADVANTA_PARTNER_ID');
    const shortcode = this.config.get<string>('ADVANTA_SHORTCODE');
    const apiUrl = this.config.get<string>('ADVANTA_API_URL');

    // Fallback / dev mode: no real credentials configured yet.
    if (!apiKey || apiKey.startsWith('your_') || !apiUrl) {
      this.logger.warn(
        `[DEV MODE - Advanta not configured] Would send SMS to ${phoneNumber}: "${message}"`,
      );
      return true;
    }

    try {
      const response = await axios.get(apiUrl, {
        params: {
          apikey: apiKey,
          partnerID: partnerId,
          message,
          shortcode,
          mobile: this.formatMsisdn(phoneNumber),
        },
      });
      this.logger.log(`Advanta SMS response: ${JSON.stringify(response.data)}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send SMS via Advanta: ${error.message}`);
      return false;
    }
  }

  // Advanta / most Kenyan SMS gateways expect MSISDN format 2547XXXXXXXX / 2541XXXXXXXX
  private formatMsisdn(phoneNumber: string): string {
    return normalizeKenyanPhone(phoneNumber);
  }
}
