import { Body, Controller, Header, HttpCode, HttpStatus, Post, UseFilters } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CommerceErrorFilter, ZodQuery } from '../../inventory/api/http.js';
import {
  buildBookingChangeDraft,
  evaluatePolicyContract,
  POLICY_CODES,
  type BookingChangeDraftInput,
  type PolicyContractInput,
} from '../domain/cancel-policy.js';

const dateTime = z.iso.datetime({ offset: true, local: true });
const emptyTime = z.literal('');
const evaluateSchema = z.object({
  policyCode: z.enum(POLICY_CODES),
  hotelSlug: z.string().trim().min(1),
  checkInIso: z.string().trim().pipe(z.union([z.iso.date(), dateTime, emptyTime])).nullish(),
  cancelAtIso: z.string().trim().pipe(z.union([dateTime, emptyTime])).nullish(),
  timezone: z.string().trim().min(1),
  totalVnd: z.number().int().nonnegative(),
  nights: z.number().int().positive(),
});

const draftSchema = z.object({
  bookingCode: z.string().trim().min(1),
  currentRoom: z.string().trim().min(1),
  targetRoom: z.string().trim().min(1),
  nights: z.number().int().positive(),
  guestNote: z.string().trim().nullish(),
});

@ApiTags('commerce')
@Controller('commerce')
@UseFilters(CommerceErrorFilter)
export class PolicyAssistantController {
  @Post('policies/evaluate')
  @HttpCode(HttpStatus.OK)
  evaluate(@Body(new ZodQuery(evaluateSchema)) body: PolicyContractInput) {
    return evaluatePolicyContract(body);
  }

  @Post('bookings/draft-change')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  draftChange(@Body(new ZodQuery(draftSchema)) body: BookingChangeDraftInput) {
    return buildBookingChangeDraft(body);
  }
}
