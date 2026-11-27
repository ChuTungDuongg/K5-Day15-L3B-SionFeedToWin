import { Body, Controller, Get, Header, HttpCode, HttpStatus, Inject, Param, Post, Query, UseFilters } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated, CurrentUser, type AuthUser } from '@vintrip/auth';
import { z } from 'zod';
import { CommerceErrorFilter, ZodQuery } from '../../inventory/api/http.js';
import { RoomUpgradeUseCases } from '../application/room-upgrade.use-cases.js';
import { QuoteRequestSchema, type QuoteRequest } from '../domain/room-upgrade.js';

const scopeSchema = z.strictObject({ hotelId: z.string().min(1).max(100) });
const listSchema = scopeSchema.extend({ roomNumber: z.string().min(1).max(100).optional() });

@ApiTags('room-upgrades')
@ApiBearerAuth()
@Authenticated()
@Controller('commerce/room-upgrades')
@UseFilters(CommerceErrorFilter)
export class RoomUpgradesController {
  constructor(@Inject(RoomUpgradeUseCases) private readonly upgrades: RoomUpgradeUseCases) {}

  @Get('bookings')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'C2: booking đang lưu trú, theo phân công khách sạn trên server' })
  list(@CurrentUser() user: AuthUser, @Query(new ZodQuery(listSchema)) query: z.infer<typeof listSchema>) {
    return this.upgrades.listBookings(user.userId, query.hotelId, query.roomNumber);
  }

  @Get('bookings/:bookingCode')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'C2: dữ liệu mô phỏng và nguồn để đề xuất nâng hạng' })
  context(@CurrentUser() user: AuthUser, @Param('bookingCode') code: string,
    @Query(new ZodQuery(scopeSchema)) query: z.infer<typeof scopeSchema>) {
    return this.upgrades.bookingContext(user.userId, query.hotelId, code);
  }

  @Post('quotes')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'C2: tính và kiểm độc lập báo giá; không giữ phòng, sửa booking hoặc thu tiền' })
  quote(@CurrentUser() user: AuthUser, @Body(new ZodQuery(QuoteRequestSchema)) body: QuoteRequest) {
    return this.upgrades.quote(user.userId, body);
  }
}
