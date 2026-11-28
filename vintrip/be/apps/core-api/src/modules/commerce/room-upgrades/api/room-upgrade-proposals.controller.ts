import {
  BadRequestException, Body, Controller, Get, Header, Headers, Inject, Param, Post, Query, Res, UseFilters,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Authenticated, CurrentUser, type AuthUser } from '@vintrip/auth';
import type { Response } from 'express';
import { z } from 'zod';
import { CommerceErrorFilter, IDEMPOTENCY_KEY_HEADER, ZodQuery } from '../../inventory/api/http.js';
import { RoomUpgradeProposalUseCases, type ProposalCommandResult } from '../application/room-upgrade-proposal.use-cases.js';
import {
  ApproveProposalRequestSchema, CreateProposalRequestSchema, EscalateProposalRequestSchema, IdempotencyKeySchema,
  ListProposalsQuerySchema, ProposalScopeQuerySchema, RejectProposalRequestSchema, ReviseProposalRequestSchema,
  type ApproveProposalRequest, type CreateProposalRequest, type EscalateProposalRequest,
  type ListProposalsQuery, type RejectProposalRequest, type ReviseProposalRequest,
} from '../domain/room-upgrade-proposal.js';

class ProposalIdPipe {
  transform(value: unknown): string {
    const parsed = z.uuid().safeParse(value);
    if (!parsed.success) throw new BadRequestException({ code: 'INVALID_PROPOSAL_ID', message: 'proposalId phải là UUID hợp lệ.' });
    return parsed.data;
  }
}
function idempotencyKey(value: unknown): string {
  const parsed = IdempotencyKeySchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Cần Idempotency-Key hợp lệ (8–128 ký tự).' });
  return parsed.data;
}
function commandResponse(res: Response, result: ProposalCommandResult) {
  res.status(result.httpStatus);
  if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
  return result.body;
}

@ApiTags('room-upgrades')
@ApiBearerAuth()
@Authenticated()
@Controller('commerce/room-upgrades/proposals')
@UseFilters(CommerceErrorFilter)
export class RoomUpgradeProposalsController {
  constructor(@Inject(RoomUpgradeProposalUseCases) private readonly proposals: RoomUpgradeProposalUseCases) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiHeader(IDEMPOTENCY_KEY_HEADER)
  async create(@CurrentUser() user: AuthUser, @Body(new ZodQuery(CreateProposalRequestSchema)) input: CreateProposalRequest,
    @Headers('idempotency-key') key: string | undefined, @Res({ passthrough: true }) res: Response) {
    return commandResponse(res, await this.proposals.createProposal(user.userId, input, idempotencyKey(key)));
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: AuthUser, @Query(new ZodQuery(ListProposalsQuerySchema)) input: ListProposalsQuery) {
    return this.proposals.listProposals(user.userId, input);
  }

  @Get('summary')
  @Header('Cache-Control', 'no-store')
  summary(@CurrentUser() user: AuthUser,
    @Query(new ZodQuery(ProposalScopeQuerySchema)) input: z.infer<typeof ProposalScopeQuerySchema>) {
    return this.proposals.getSummary(user.userId, input.hotelId);
  }

  @Get(':proposalId')
  @Header('Cache-Control', 'no-store')
  detail(@CurrentUser() user: AuthUser, @Param('proposalId', new ProposalIdPipe()) id: string,
    @Query(new ZodQuery(ProposalScopeQuerySchema)) input: z.infer<typeof ProposalScopeQuerySchema>) {
    return this.proposals.getProposal(user.userId, id, input.hotelId);
  }

  @Get(':proposalId/history')
  @Header('Cache-Control', 'no-store')
  history(@CurrentUser() user: AuthUser, @Param('proposalId', new ProposalIdPipe()) id: string,
    @Query(new ZodQuery(ProposalScopeQuerySchema)) input: z.infer<typeof ProposalScopeQuerySchema>) {
    return this.proposals.getProposalHistory(user.userId, id, input.hotelId);
  }

  @Post(':proposalId/revise')
  @Header('Cache-Control', 'no-store')
  @ApiHeader(IDEMPOTENCY_KEY_HEADER)
  async revise(@CurrentUser() user: AuthUser, @Param('proposalId', new ProposalIdPipe()) id: string,
    @Body(new ZodQuery(ReviseProposalRequestSchema)) input: ReviseProposalRequest,
    @Headers('idempotency-key') key: string | undefined, @Res({ passthrough: true }) res: Response) {
    return commandResponse(res, await this.proposals.reviseProposal(user.userId, id, input, idempotencyKey(key)));
  }

  @Post(':proposalId/approve')
  @Header('Cache-Control', 'no-store')
  @ApiHeader(IDEMPOTENCY_KEY_HEADER)
  async approve(@CurrentUser() user: AuthUser, @Param('proposalId', new ProposalIdPipe()) id: string,
    @Body(new ZodQuery(ApproveProposalRequestSchema)) input: ApproveProposalRequest,
    @Headers('idempotency-key') key: string | undefined, @Res({ passthrough: true }) res: Response) {
    return commandResponse(res, await this.proposals.approveProposal(user.userId, id, input, idempotencyKey(key)));
  }

  @Post(':proposalId/reject')
  @Header('Cache-Control', 'no-store')
  @ApiHeader(IDEMPOTENCY_KEY_HEADER)
  async reject(@CurrentUser() user: AuthUser, @Param('proposalId', new ProposalIdPipe()) id: string,
    @Body(new ZodQuery(RejectProposalRequestSchema)) input: RejectProposalRequest,
    @Headers('idempotency-key') key: string | undefined, @Res({ passthrough: true }) res: Response) {
    return commandResponse(res, await this.proposals.rejectProposal(user.userId, id, input, idempotencyKey(key)));
  }

  @Post(':proposalId/escalate')
  @Header('Cache-Control', 'no-store')
  @ApiHeader(IDEMPOTENCY_KEY_HEADER)
  async escalate(@CurrentUser() user: AuthUser, @Param('proposalId', new ProposalIdPipe()) id: string,
    @Body(new ZodQuery(EscalateProposalRequestSchema)) input: EscalateProposalRequest,
    @Headers('idempotency-key') key: string | undefined, @Res({ passthrough: true }) res: Response) {
    return commandResponse(res, await this.proposals.escalateProposal(user.userId, id, input, idempotencyKey(key)));
  }
}
