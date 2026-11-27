import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureHttp, HttpError } from './http';
import {
  createLogicalCommandManager, invalidateRoomUpgradeQueries, parseRoomUpgradeError, roomUpgradeQueryKeys,
  roomUpgradesApi, useBookingContext, useInHouseBookings, useProposalDetail, useProposalHistory,
  useProposalsList, useStaffContext, useStaffSummary,
  type ProposalCommandOperation, type RoomUpgradeErrorKind,
} from './room-upgrades';

const hooks = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn() }));
vi.mock('./session', () => ({ useApiSession: hooks.session }));
vi.mock('@tanstack/react-query', async (original) => ({
  ...await original<typeof import('@tanstack/react-query')>(), useQuery: hooks.query,
}));
const json = (body: unknown, status = 200, replayed?: string) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', ...(replayed === undefined ? {} : { 'idempotency-replayed': replayed }) },
});
const hotelId = 'hotel /+&?';
const bookingCode = 'BK /+&?';
const proposalId = 'proposal /+&?';
const base = '/api/commerce/room-upgrades';
const createBody = { hotelId, bookingCode, targetRoomTypeId: 'DLX', effectiveAt: '2026-12-11T14:00:00+07:00' };
const decisionBody = { hotelId, expectedVersion: 1, reason: 'Đã kiểm tra.' };
const key = (options?: RequestInit) => new Headers(options?.headers).get('idempotency-key');

beforeEach(() => {
  vi.clearAllMocks();
  configureHttp({ baseUrl: 'https://gateway.example', getAccessToken: () => 'access-token' });
  hooks.session.mockReturnValue({ user: { id: 'staff-1' }, isReady: true });
});
afterEach(() => vi.restoreAllMocks());

describe('roomUpgradesApi read contracts', () => {
  const reads = [
    { name: 'getStaffContext', path: `${base}/staff-context`, query: {}, call: (signal: AbortSignal) => roomUpgradesApi.getStaffContext(signal) },
    { name: 'getSummary', path: `${base}/proposals/summary`, query: { hotelId }, call: (signal: AbortSignal) => roomUpgradesApi.getSummary(hotelId, signal) },
    { name: 'listBookings', path: `${base}/bookings`, query: { hotelId, roomNumber: '101 /&' }, call: (signal: AbortSignal) => roomUpgradesApi.listBookings(hotelId, '101 /&', signal) },
    { name: 'getBookingContext', path: `${base}/bookings/${encodeURIComponent(bookingCode)}`, query: { hotelId }, call: (signal: AbortSignal) => roomUpgradesApi.getBookingContext(hotelId, bookingCode, signal) },
    { name: 'listProposals', path: `${base}/proposals`, query: { hotelId, status: 'PENDING_MANAGER', bookingCode, requiredApprovalRole: 'MANAGER', limit: '5', offset: '20' },
      call: (signal: AbortSignal) => roomUpgradesApi.listProposals({ hotelId, status: 'PENDING_MANAGER', bookingCode, requiredApprovalRole: 'MANAGER', limit: 5, offset: 20 }, signal) },
    { name: 'getProposal', path: `${base}/proposals/${encodeURIComponent(proposalId)}`, query: { hotelId }, call: (signal: AbortSignal) => roomUpgradesApi.getProposal(hotelId, proposalId, signal) },
    { name: 'getProposalHistory', path: `${base}/proposals/${encodeURIComponent(proposalId)}/history`, query: { hotelId }, call: (signal: AbortSignal) => roomUpgradesApi.getProposalHistory(hotelId, proposalId, signal) },
  ];
  it.each(reads)('$name uses the exact path, encoded scope, shared auth and AbortSignal', async ({ path, query, call }) => {
    const send = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ marker: 'wire response' }));
    const signal = new AbortController().signal;
    expect(await call(signal)).toEqual({ marker: 'wire response' });
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.origin).toBe('https://gateway.example');
    expect(parsed.pathname).toBe(path);
    expect(Object.fromEntries(parsed.searchParams)).toEqual(query);
    expect(init?.method ?? 'GET').toBe('GET');
    expect(init?.signal).toBe(signal);
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer access-token');
    expect(new Headers(init?.headers).get('x-request-id')).toBeTruthy();
  });

  it('omits unspecified optional query fields and preserves zero offset', async () => {
    const send = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({}));
    await roomUpgradesApi.listBookings(hotelId);
    await roomUpgradesApi.listProposals({ hotelId, offset: 0 });
    expect(Object.fromEntries(new URL(String(send.mock.calls[0]![0])).searchParams)).toEqual({ hotelId });
    expect(Object.fromEntries(new URL(String(send.mock.calls[1]![0])).searchParams)).toEqual({ hotelId, offset: '0' });
  });

  it.each([
    { name: 'calculateQuote', path: `${base}/quotes`, body: createBody, call: (signal: AbortSignal) => roomUpgradesApi.calculateQuote(createBody, signal) },
    { name: 'chatCopilot', path: '/ai/room-upgrades/chat', body: { hotelId, message: 'Nâng hạng phòng', sessionId: 'session' },
      call: (signal: AbortSignal) => roomUpgradesApi.chatCopilot({ hotelId, message: 'Nâng hạng phòng', sessionId: 'session' }, signal) },
  ])('$name posts JSON through the gateway and forwards cancellation', async ({ path, body, call }) => {
    const send = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ marker: 'result' }));
    const signal = new AbortController().signal;
    expect(await call(signal)).toEqual({ marker: 'result' });
    const [url, init] = send.mock.calls[0]!;
    expect(url).toBe(`https://gateway.example${path}`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(body);
    expect(init?.signal).toBe(signal);
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer access-token');
    if (path === '/ai/room-upgrades/chat') expect(init?.credentials).toBe('omit');
  });
});

describe('roomUpgradesApi commands', () => {
  const commands = [
    { name: 'createProposal', path: `${base}/proposals`, body: createBody, call: (idempotencyKey: string) => roomUpgradesApi.createProposal(createBody, idempotencyKey) },
    { name: 'reviseProposal', path: `${base}/proposals/${encodeURIComponent(proposalId)}/revise`, body: decisionBody, call: (idempotencyKey: string) => roomUpgradesApi.reviseProposal(proposalId, decisionBody, idempotencyKey) },
    { name: 'approveProposal', path: `${base}/proposals/${encodeURIComponent(proposalId)}/approve`, body: decisionBody, call: (idempotencyKey: string) => roomUpgradesApi.approveProposal(proposalId, decisionBody, idempotencyKey) },
    { name: 'rejectProposal', path: `${base}/proposals/${encodeURIComponent(proposalId)}/reject`, body: decisionBody, call: (idempotencyKey: string) => roomUpgradesApi.rejectProposal(proposalId, decisionBody, idempotencyKey) },
    { name: 'escalateProposal', path: `${base}/proposals/${encodeURIComponent(proposalId)}/escalate`, body: decisionBody, call: (idempotencyKey: string) => roomUpgradesApi.escalateProposal(proposalId, decisionBody, idempotencyKey) },
  ];
  it.each(commands)('$name sends an explicit stable Idempotency-Key and exposes status/replay', async ({ path, body, call }) => {
    const send = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ proposalId: 'stored' }, 201, 'true'));
    expect(await call('logical-command-key')).toEqual({ data: { proposalId: 'stored' }, status: 201, replayed: true });
    const [url, init] = send.mock.calls[0]!;
    expect(url).toBe(`https://gateway.example${path}`);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify(body));
    expect(key(init)).toBe('logical-command-key');
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer access-token');
    expect(new Headers(init?.headers).get('x-request-id')).toBeTruthy();
  });

  it.each([undefined, 'false', 'TRUE', '1'])('only literal true is a replay (header=%s)', async (header) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}, 200, header));
    expect((await roomUpgradesApi.approveProposal(proposalId, decisionBody, 'explicit-key')).replayed).toBe(false);
  });

  it('preserves the explicit key and body through exactly one 401 refresh', async () => {
    let token = 'old-token';
    const refresh = vi.fn(async () => { token = 'new-token'; return true; });
    configureHttp({ baseUrl: 'https://gateway.example', getAccessToken: () => token, refreshAccessToken: refresh });
    const send = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({ proposalId }, 200));
    await roomUpgradesApi.approveProposal(proposalId, decisionBody, 'explicit-key');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([, init]) => key(init))).toEqual(['explicit-key', 'explicit-key']);
    expect(send.mock.calls[1]![1]?.body).toBe(send.mock.calls[0]![1]?.body);
    expect(new Headers(send.mock.calls[1]![1]?.headers).get('authorization')).toBe('Bearer new-token');
    send.mockReset().mockResolvedValue(json({}, 401));
    await expect(roomUpgradesApi.approveProposal(proposalId, decisionBody, 'another-key')).rejects.toMatchObject({ status: 401 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe('logical command manager', () => {
  it('reuses the exact UUID across a lost response, HTTP 503 and a successful replay', async () => {
    const manager = createLogicalCommandManager();
    const send = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('lost response'))
      .mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ proposalId }, 201, 'true'));
    const execute = () => manager.execute('CREATE', 'new', createBody, (idempotencyKey) => roomUpgradesApi.createProposal(createBody, idempotencyKey));
    await expect(execute()).rejects.toBeInstanceOf(TypeError);
    await expect(execute()).rejects.toMatchObject({ status: 503 });
    expect(await execute()).toMatchObject({ status: 201, replayed: true });
    const keys = send.mock.calls.map(([, init]) => key(init));
    expect(keys[0]).toMatch(/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/);
    expect(new Set(keys).size).toBe(1);
    expect(new Set(send.mock.calls.map(([, init]) => init?.body)).size).toBe(1);
  });

  it.each([new DOMException('cancelled', 'AbortError'), new DOMException('timeout', 'TimeoutError'), new HttpError(408, {}), new HttpError(504, {})])(
    'retains the key after timeout/cancellation (%s)', async (error) => {
      const manager = createLogicalCommandManager();
      const executor = vi.fn<(key: string) => Promise<string>>().mockRejectedValueOnce(error).mockResolvedValueOnce('ok');
      await expect(manager.execute('APPROVE', proposalId, decisionBody, executor)).rejects.toBe(error);
      await manager.execute('APPROVE', proposalId, decisionBody, executor);
      expect(executor.mock.calls[0]![0]).toBe(executor.mock.calls[1]![0]);
    },
  );

  it('returns the same pending promise for reordered nested payloads and blocks double clicks even after reset', async () => {
    const manager = createLogicalCommandManager();
    let resolve!: (value: string) => void;
    const executor = vi.fn((_key: string) => new Promise<string>((done) => { resolve = done; }));
    const first = manager.execute('CREATE', 'new', { a: [{ z: 1, b: 2 }], c: 3 }, executor);
    const second = manager.execute('CREATE', 'new', { c: 3, a: [{ b: 2, z: 1 }] }, executor);
    expect(first).toBe(second);
    manager.reset();
    expect(manager.execute('CREATE', 'new', { c: 3, a: [{ b: 2, z: 1 }] }, executor)).toBe(first);
    await Promise.resolve();
    expect(executor).toHaveBeenCalledTimes(1);
    resolve('created');
    expect(await first).toBe('created');
  });

  it('canonicalizes recursively with JSON semantics while retaining failed command keys', async () => {
    const manager = createLogicalCommandManager();
    const executor = vi.fn<(key: string) => Promise<void>>().mockRejectedValue(new TypeError('network'));
    await expect(manager.execute('CREATE', 'new', { z: [{ b: 2, a: 1 }], optional: undefined }, executor)).rejects.toThrow();
    await expect(manager.execute('CREATE', 'new', { z: [{ a: 1, b: 2 }] }, executor)).rejects.toThrow();
    expect(executor.mock.calls[0]![0]).toBe(executor.mock.calls[1]![0]);
  });

  it('rotates for expectedVersion, reason, decision/operation and target changes, and explicit reset', async () => {
    const manager = createLogicalCommandManager();
    const executor = vi.fn<(key: string) => Promise<void>>().mockRejectedValue(new TypeError('network'));
    const attempts: [ProposalCommandOperation, string, object][] = [
      ['APPROVE', 'p1', { ...decisionBody }], ['APPROVE', 'p1', { ...decisionBody, expectedVersion: 2 }],
      ['APPROVE', 'p1', { ...decisionBody, expectedVersion: 2, reason: 'Lý do mới' }],
      ['REJECT', 'p1', { ...decisionBody }], ['APPROVE', 'p2', { ...decisionBody }],
    ];
    for (const [operation, target, payload] of attempts) await expect(manager.execute(operation, target, payload, executor)).rejects.toThrow();
    manager.reset();
    await expect(manager.execute('APPROVE', 'p2', decisionBody, executor)).rejects.toThrow();
    expect(new Set(executor.mock.calls.map(([idempotencyKey]) => idempotencyKey)).size).toBe(6);
  });

  it.each([
    [400, 'INVALID_INPUT'], [401, 'UNAUTHORIZED'], [403, 'HOTEL_ACCESS_DENIED'], [404, 'PROPOSAL_NOT_FOUND'], [422, 'QUOTE_NOT_PERSISTABLE'],
    [409, 'VERSION_CONFLICT'], [409, 'PREVIEW_MISMATCH'], [409, 'IDEMPOTENCY_PAYLOAD_MISMATCH'], [409, 'INVALID_STATE_TRANSITION'],
  ] as const)('clears deterministic %s %s without automatically retrying or changing version', async (status, code) => {
    const manager = createLogicalCommandManager();
    const executor = vi.fn<(key: string) => Promise<string>>().mockRejectedValueOnce(new HttpError(status, { code, currentVersion: 2 })).mockResolvedValue('ok');
    await expect(manager.execute('APPROVE', proposalId, decisionBody, executor)).rejects.toMatchObject({ status });
    expect(executor).toHaveBeenCalledTimes(1);
    await manager.execute('APPROVE', proposalId, decisionBody, executor);
    expect(executor.mock.calls[0]![0]).not.toBe(executor.mock.calls[1]![0]);
    expect(decisionBody.expectedVersion).toBe(1);
  });

  it('starts the revised command with a new key after VERSION_CONFLICT', async () => {
    const manager = createLogicalCommandManager();
    const executor = vi.fn<(key: string) => Promise<string>>().mockRejectedValueOnce(new HttpError(409, { code: 'VERSION_CONFLICT' })).mockResolvedValue('ok');
    await expect(manager.execute('APPROVE', proposalId, decisionBody, executor)).rejects.toThrow();
    await manager.execute('APPROVE', proposalId, { ...decisionBody, expectedVersion: 2 }, executor);
    expect(executor.mock.calls[0]![0]).not.toBe(executor.mock.calls[1]![0]);
  });

  it.each(['REQUOTE_REQUIRED', 'PROPOSAL_EXPIRED'])('retains committed %s for replay instead of re-sending an old version as a new command', async (code) => {
    const manager = createLogicalCommandManager();
    const executor = vi.fn<(key: string) => Promise<string>>().mockRejectedValue(new HttpError(409, { code }));
    await expect(manager.execute('APPROVE', proposalId, decisionBody, executor)).rejects.toThrow();
    await expect(manager.execute('APPROVE', proposalId, decisionBody, executor)).rejects.toThrow();
    expect(executor.mock.calls[0]![0]).toBe(executor.mock.calls[1]![0]);
    await expect(manager.execute('APPROVE', proposalId, { ...decisionBody, expectedVersion: 2 }, executor)).rejects.toThrow();
    expect(executor.mock.calls[2]![0]).not.toBe(executor.mock.calls[1]![0]);
  });

  it.each([new HttpError(409, { code: 'CONCURRENT_MODIFICATION' }), new HttpError(429, {})])(
    'keeps the logical key on a retryable contention/rate-limit response: %s', async (error) => {
      const manager = createLogicalCommandManager();
      const executor = vi.fn<(key: string) => Promise<string>>().mockRejectedValueOnce(error).mockResolvedValue('ok');
      await expect(manager.execute('APPROVE', proposalId, decisionBody, executor)).rejects.toThrow();
      await manager.execute('APPROVE', proposalId, decisionBody, executor);
      expect(executor.mock.calls[0]![0]).toBe(executor.mock.calls[1]![0]);
    },
  );

  it('clears successful commands and does not let an older pending command clear a changed payload', async () => {
    const manager = createLogicalCommandManager();
    let resolveOld!: (value: string) => void;
    const oldExecutor = vi.fn((_key: string) => new Promise<string>((done) => { resolveOld = done; }));
    const executor = vi.fn<(key: string) => Promise<string>>().mockRejectedValueOnce(new TypeError('network')).mockResolvedValue('ok');
    const old = manager.execute('APPROVE', proposalId, decisionBody, oldExecutor);
    const changed = { ...decisionBody, expectedVersion: 2 };
    await expect(manager.execute('APPROVE', proposalId, changed, executor)).rejects.toThrow();
    resolveOld('old');
    await old;
    await manager.execute('APPROVE', proposalId, changed, executor);
    await manager.execute('APPROVE', proposalId, changed, executor);
    expect(executor.mock.calls[0]![0]).toBe(executor.mock.calls[1]![0]);
    expect(executor.mock.calls[2]![0]).not.toBe(executor.mock.calls[1]![0]);
  });

  it('turns synchronous executor throws into rejected promises that can be retried', async () => {
    const manager = createLogicalCommandManager();
    const executor = vi.fn((_key: string): Promise<string> => { throw new TypeError('transport'); });
    await expect(manager.execute('CREATE', 'new', createBody, executor)).rejects.toThrow('transport');
    await expect(manager.execute('CREATE', 'new', createBody, executor)).rejects.toThrow('transport');
    expect(executor.mock.calls[0]![0]).toBe(executor.mock.calls[1]![0]);
  });
});

describe('structured room upgrade errors', () => {
  const cases: [number, string | undefined, RoomUpgradeErrorKind][] = [
    [401, undefined, 'unauthorized'], [403, 'HOTEL_ACCESS_DENIED', 'forbidden'], [403, 'INSUFFICIENT_APPROVAL_ROLE', 'forbidden'],
    [404, 'PROPOSAL_NOT_FOUND', 'not_found'], [409, 'VERSION_CONFLICT', 'version_conflict'], [409, 'REQUOTE_REQUIRED', 'requote_required'],
    [409, 'PROPOSAL_EXPIRED', 'proposal_expired'], [409, 'PREVIEW_MISMATCH', 'preview_mismatch'],
    [409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'idempotency_mismatch'], [409, 'CONCURRENT_MODIFICATION', 'concurrent_modification'],
    [409, 'INVALID_STATE_TRANSITION', 'invalid_state'], [422, 'QUOTE_NOT_PERSISTABLE', 'not_persistable'],
    [400, 'INVALID_PROPOSAL_ID', 'validation'], [422, undefined, 'validation'],
    [503, undefined, 'dependency_unavailable'], [504, undefined, 'dependency_unavailable'], [418, undefined, 'unknown'],
  ];
  it.each(cases)('maps HTTP %s %s to %s with a Vietnamese fallback', (status, code, kind) => {
    const result = parseRoomUpgradeError(new HttpError(status, { code }));
    expect(result).toMatchObject({ status, code, kind });
    expect(result.message).toMatch(/[\u0080-\uFFFF]/);
  });

  it('preserves all structured conflict and validation fields and the backend Vietnamese message', () => {
    const body = { code: 'REQUOTE_REQUIRED', message: 'Cần báo giá lại.', reasonCodes: ['RATE_CHANGED'], currentVersion: 2,
      currentStatus: 'REQUOTE_REQUIRED', proposal: { proposalId: 'p1', version: 2 }, freshQuote: { quoteId: 'q1' },
      violations: [{ code: 'RATE_CHANGED', field: 'rate', message: 'Giá thay đổi.' }], missingFields: ['effectiveAt'] };
    expect(parseRoomUpgradeError(new HttpError(409, body))).toEqual({ ...body, status: 409, kind: 'requote_required' });
  });

  it.each([new TypeError('secret transport details'), new DOMException('cancelled', 'AbortError'), new DOMException('timeout', 'TimeoutError')])(
    'maps transport/timeout failure to a safe message: %s', (error) => {
      const result = parseRoomUpgradeError(error);
      expect(result.kind).toBe('network');
      expect(result.status).toBeUndefined();
      expect(result.message).not.toContain(error.message);
    },
  );

  it('handles malformed bodies and unknown errors without throwing or exposing server internals', () => {
    for (const body of [null, '<html>bad gateway</html>', [], { message: ['Invalid'], currentVersion: '2', currentStatus: 'INVENTED',
      reasonCodes: [123], missingFields: [123], violations: null, proposal: null, freshQuote: null }]) {
      expect(parseRoomUpgradeError(new HttpError(400, body))).toMatchObject({ kind: 'validation', currentVersion: undefined,
        currentStatus: undefined, proposal: undefined, freshQuote: undefined });
    }
    expect(parseRoomUpgradeError(new HttpError(503, { message: 'SQL password leak' })).message).not.toContain('SQL');
    expect(parseRoomUpgradeError(new Error('private data')).kind).toBe('unknown');
    expect(parseRoomUpgradeError(undefined).kind).toBe('unknown');
    expect(parseRoomUpgradeError(new HttpError(401, { message: 'Unauthorized' })).message).toMatch(/đăng nhập/);
    expect(parseRoomUpgradeError(new HttpError(403, { detail: 'Phiên làm việc thuộc khách sạn khác.' })).message).toBe('Phiên làm việc thuộc khách sạn khác.');
  });
});

describe('query cache isolation and invalidation', () => {
  it('includes the account in every key and the hotel in every scoped key', () => {
    const keys = (user: string | null, hotel: string) => [
      roomUpgradeQueryKeys.all(user), roomUpgradeQueryKeys.staffContext(user), roomUpgradeQueryKeys.hotelScope(user, hotel),
      roomUpgradeQueryKeys.summary(user, hotel), roomUpgradeQueryKeys.bookings(user, hotel, '101'),
      roomUpgradeQueryKeys.bookingContext(user, hotel, 'BK'), roomUpgradeQueryKeys.proposals(user, hotel, { status: 'APPROVED' }),
      roomUpgradeQueryKeys.proposalDetail(user, hotel, 'p1'), roomUpgradeQueryKeys.proposalHistory(user, hotel, 'p1'),
    ];
    const first = keys('staff-1', 'hotel-1');
    const second = keys('staff-2', 'hotel-1');
    const anonymous = keys(null, 'hotel-1');
    const otherHotelKeys = keys('staff-1', 'hotel-2');
    first.forEach((queryKey, index) => {
      expect(queryKey).not.toEqual(second[index]);
      expect(queryKey).not.toEqual(anonymous[index]);
      if (index >= 2) expect(queryKey).not.toEqual(otherHotelKeys[index]);
    });
    expect(roomUpgradeQueryKeys.bookings('staff-1', 'hotel-1', '101')).not.toEqual(roomUpgradeQueryKeys.bookings('staff-1', 'hotel-1', '102'));
    expect(roomUpgradeQueryKeys.proposals('staff-1', 'hotel-1', { offset: 0 })).not.toEqual(roomUpgradeQueryKeys.proposals('staff-1', 'hotel-1', { offset: 20 }));
  });

  it.each([undefined, 'p1'])('invalidates all filtered bookings/lists and optional detail/history only within the user/hotel (%s)', async (id) => {
    const client = new QueryClient();
    const selected = [roomUpgradeQueryKeys.summary('staff-1', 'h1'), roomUpgradeQueryKeys.bookings('staff-1', 'h1', '101'),
      roomUpgradeQueryKeys.proposals('staff-1', 'h1', { status: 'APPROVED', offset: 20 })];
    const detail = [roomUpgradeQueryKeys.proposalDetail('staff-1', 'h1', 'p1'), roomUpgradeQueryKeys.proposalHistory('staff-1', 'h1', 'p1')];
    const untouched = [roomUpgradeQueryKeys.summary('staff-2', 'h1'), roomUpgradeQueryKeys.summary('staff-1', 'h2'),
      roomUpgradeQueryKeys.staffContext('staff-1'), roomUpgradeQueryKeys.proposalDetail('staff-1', 'h1', 'p2')];
    for (const queryKey of [...selected, ...detail, ...untouched]) client.setQueryData(queryKey, { value: 1 });
    await invalidateRoomUpgradeQueries(client, 'staff-1', 'h1', id);
    for (const queryKey of selected) expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
    for (const queryKey of detail) expect(client.getQueryState(queryKey)?.isInvalidated).toBe(Boolean(id));
    for (const queryKey of untouched) expect(client.getQueryState(queryKey)?.isInvalidated).toBe(false);
    client.clear();
  });
});

describe('staff query hooks', () => {
  const hookCases = [
    { name: 'staff context', run: () => useStaffContext(), path: `${base}/staff-context`, queryKey: roomUpgradeQueryKeys.staffContext('staff-1') },
    { name: 'summary', run: () => useStaffSummary(hotelId), path: `${base}/proposals/summary`, queryKey: roomUpgradeQueryKeys.summary('staff-1', hotelId) },
    { name: 'bookings', run: () => useInHouseBookings(hotelId, '101'), path: `${base}/bookings`, queryKey: roomUpgradeQueryKeys.bookings('staff-1', hotelId, '101') },
    { name: 'booking context', run: () => useBookingContext(hotelId, bookingCode), path: `${base}/bookings/${encodeURIComponent(bookingCode)}`, queryKey: roomUpgradeQueryKeys.bookingContext('staff-1', hotelId, bookingCode) },
    { name: 'proposals', run: () => useProposalsList({ hotelId, status: 'APPROVED' }), path: `${base}/proposals`, queryKey: roomUpgradeQueryKeys.proposals('staff-1', hotelId, { status: 'APPROVED' }) },
    { name: 'detail', run: () => useProposalDetail(hotelId, proposalId), path: `${base}/proposals/${encodeURIComponent(proposalId)}`, queryKey: roomUpgradeQueryKeys.proposalDetail('staff-1', hotelId, proposalId) },
    { name: 'history', run: () => useProposalHistory(hotelId, proposalId), path: `${base}/proposals/${encodeURIComponent(proposalId)}/history`, queryKey: roomUpgradeQueryKeys.proposalHistory('staff-1', hotelId, proposalId) },
  ];
  interface QueryOptions { queryKey: readonly unknown[]; enabled: boolean; retry: false; queryFn: (context: { signal: AbortSignal }) => Promise<unknown> }
  const options = () => hooks.query.mock.calls.at(-1)![0] as QueryOptions;
  it.each(hookCases)('$name uses session account, disables retries and forwards the query signal', async ({ run, path, queryKey }) => {
    const send = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ result: true }));
    run();
    expect(options()).toMatchObject({ queryKey, enabled: true, retry: false });
    const signal = new AbortController().signal;
    await options().queryFn({ signal });
    expect(new URL(String(send.mock.calls[0]![0])).pathname).toBe(path);
    expect(send.mock.calls[0]![1]?.signal).toBe(signal);
  });

  it.each(hookCases)('$name stays disabled until authenticated session is ready', ({ run }) => {
    for (const session of [{ user: null, isReady: true }, { user: { id: 'staff-1' }, isReady: false }]) {
      hooks.session.mockReturnValue(session);
      run();
      expect(options().enabled).toBe(false);
    }
    hooks.session.mockReturnValue({ user: { id: 'staff-2' }, isReady: true });
    run();
    expect(options().queryKey[1]).toBe('staff-2');
  });

  it('disables hotel and entity queries for missing identifiers', () => {
    for (const run of [() => useStaffSummary(''), () => useInHouseBookings(''), () => useBookingContext(hotelId, ''),
      () => useProposalsList({ hotelId: '' }), () => useProposalDetail('', proposalId), () => useProposalDetail(hotelId, ''),
      () => useProposalHistory(hotelId, '')]) {
      run();
      expect(options().enabled).toBe(false);
    }
  });
});
