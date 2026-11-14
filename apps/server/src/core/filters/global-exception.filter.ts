import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AppException } from "../exceptions/app.exception";
import { ApiResponse } from "@tobomeet/shared/types";
import { recordLatencyLog } from "../interceptors/logging.interceptor";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "Đã có lỗi hệ thống xảy ra";
    let code = 5000;

    if (exception instanceof AppException) {
      const errorDetail = exception.getErrorDetail();
      status = errorDetail.statusCode;
      message = errorDetail.message;
      code = errorDetail.code;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;
      message = exceptionResponse.message || exception.message;
      code = status;
    } else {
      console.error("Lỗi Server:", exception);
    }

    // Ghi nhận latency nếu exception xảy ra ở Guard (trước khi vào Interceptor)
    if ((request as any)?._timings && !(request as any)?._timings.isLogged) {
      recordLatencyLog(request, status, 0);
    }

    const errorResponse: ApiResponse<null> = {
      code: code,
      message: Array.isArray(message) ? message[0] : message,
      result: null,
    };

    response.status(status).json(errorResponse);
  }
}
