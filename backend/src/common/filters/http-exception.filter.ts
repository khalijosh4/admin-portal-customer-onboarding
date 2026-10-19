import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawResponse =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    const message = (() => {
      if (typeof rawResponse === 'string') return rawResponse;
      if (Array.isArray((rawResponse as any).message)) return (rawResponse as any).message;
      if (typeof (rawResponse as any).message === 'string') return (rawResponse as any).message;
      if (typeof (rawResponse as any).error === 'string') return (rawResponse as any).error;
      return JSON.stringify(rawResponse);
    })();

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message,
    });
  }
}
