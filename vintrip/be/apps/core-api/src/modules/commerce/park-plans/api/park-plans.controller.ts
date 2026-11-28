import { Body, Controller, Get, Header, HttpCode, HttpStatus, Inject, Param, Post, UseFilters } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommerceErrorFilter, ZodQuery } from '../../inventory/api/http.js';
import { ParkPlanUseCases } from '../application/park-plan.use-cases.js';
import { ValidateParkPlanRequestSchema, type ValidateParkPlanRequest } from '../domain/park-snapshot.js';

// Không cần đăng nhập: chỉ đọc dữ liệu mô phỏng và tính toán, không giữ chỗ, không mua vé.
@ApiTags('park-plans')
@Controller('commerce')
@UseFilters(CommerceErrorFilter)
export class ParkPlansController {
  constructor(@Inject(ParkPlanUseCases) private readonly parkPlans: ParkPlanUseCases) {}

  @Get('parks/:parkId/snapshot')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'C1: snapshot công viên (hoạt động, giá, suất diễn, sự cố, phút đi bộ) cho bộ lập lịch' })
  snapshot(@Param('parkId') parkId: string) {
    return this.parkPlans.getSnapshot(parkId);
  }

  @Post('park-plans/validate')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'C1: kiểm độc lập lịch một ngày trên snapshot của core-api; không ghi dữ liệu' })
  validate(@Body(new ZodQuery(ValidateParkPlanRequestSchema)) body: ValidateParkPlanRequest) {
    return this.parkPlans.validate(body);
  }
}
