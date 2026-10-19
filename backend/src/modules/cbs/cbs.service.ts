import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

/**
 * Read-only client for the CBS (Spring Boot) application API.
 *
 * Confirmed endpoint used by the admin portal:
 *   GET {CBS_CORE_BASE_URL}/api/applications/{applicationId}   -> one application
 *
 * Every response uses the envelope:
 *   { success: boolean, data?: any, error?: ErrorDetail, meta?: { requestId, timestamp } }
 * with ErrorDetail = { code, message, field, fields, retryAfter, unlocksAt }.
 *
 * Write-side CBS flows (createCustomer, submit-to-core, core-status, OTP
 * lookups) were removed in the admin-portal cut-down — the browser calls the
 * CBS directly for listing/detail/identity-review/submit.
 */
@Injectable()
export class CbsService {
  private readonly logger = new Logger(CbsService.name);
  private readonly baseUrl: string;
  private readonly prefix: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (
      this.config.get<string>('CBS_CORE_BASE_URL') || 'http://10.10.102.132:8087'
    ).replace(/\/+$/, '');
    this.prefix = (
      this.config.get<string>('CBS_CORE_API_PREFIX', '/api') || '/api'
    ).replace(/\/+$/, '');
    this.timeoutMs = this.config.get<number>('CBS_CORE_TIMEOUT_MS', 15000);
  }

  private url(path: string): string {
    return `${this.baseUrl}${this.prefix}${path}`;
  }

  /** One CBS application by its applicationId (APP-...), or null when absent. */
  async getApplication(cbsApplicationId: string): Promise<any | null> {
    const res = await this.getSafely(`/applications/${encodeURIComponent(cbsApplicationId)}`);
    if (Array.isArray(res.data)) return res.data[0] ?? null;
    return res.data ?? null;
  }

  // Helper: safe GET returning the envelope data.
  private async getSafely(path: string): Promise<any> {
    try {
      const response = await axios.get(this.url(path), {
        timeout: this.timeoutMs,
        headers: { accept: '*/*' },
      });
      return response.data || {};
    } catch (err) {
      const respBody = (err as AxiosError)?.response?.data;
      throw new Error(this.extractError(err, respBody));
    }
  }

  /**
   * Extract the human-readable failure reason from any response shape.
   * Handles the standard envelope AND raw axios/HTTP errors.
   */
  private extractError(err: unknown, body?: any): string {
    if (body?.error) {
      const { code, message, field, fields, retryAfter } = body.error;
      const parts: string[] = [];
      if (code) parts.push(code);
      if (message && message !== 'An unexpected error occurred. Please try again or contact support.') {
        parts.push(message);
      }
      if (field) parts.push(`field: ${field}`);
      if (fields && typeof fields === 'object' && Object.keys(fields).length) {
        parts.push(`details: ${JSON.stringify(fields)}`);
      }
      if (retryAfter != null) parts.push(`retry after ${retryAfter}s`);
      if (parts.length) return parts.join(' — ');
      return code || message || 'Unknown CBS error';
    }

    if (err instanceof AxiosError || (err as any)?.isAxiosError) {
      const ax = err as AxiosError<any>;
      const status = ax.response?.status;
      const respBody = ax.response?.data;
      if (respBody?.error) return this.extractError(undefined, respBody);
      const detail = typeof respBody === 'string' ? respBody : JSON.stringify(respBody);
      return `HTTP ${status ?? 'error'}${detail ? ` — ${detail.slice(0, 300)}` : ''}`;
    }

    return err instanceof Error ? err.message : String(err);
  }
}
