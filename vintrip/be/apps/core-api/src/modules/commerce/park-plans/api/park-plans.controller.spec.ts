import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyGlobalPrefix } from '../../../../platform/http.js';
import { CONG_VIEN_MAU_SNAPSHOT } from '../infra/cong-vien-mau.snapshot.js';
import { ParkPlansModule } from '../park-plans.module.js';

const route = '/api/commerce/park-plans/validate';
const validateBody = {
  parkId: 'cong-vien-mau',
  snapshotId: CONG_VIEN_MAU_SNAPSHOT.snapshotId,
  request: {
    members: [{ kind: 'adult', label: 'Người lớn 1' }, { kind: 'adult', label: 'Người lớn 2' }],
    window: ['09:00', '12:00'],
    budgetVnd: 900_000,
  },
  items: [{ kind: 'activity', id: 'A1', zone: 'KHU_A', start: '09:05', end: '10:15' }],
};

describe('park-plans HTTP (C1)', () => {
  let app: INestApplication;
  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [ParkPlansModule] }).compile();
    app = module.createNestApplication();
    applyGlobalPrefix(app);
    await app.init();
  });
  afterEach(async () => { await app.close(); });

  it('trả snapshot Công viên Mẫu, có isMock và snapshotId', async () => {
    const response = await request(app.getHttpServer()).get('/api/commerce/parks/cong-vien-mau/snapshot').expect(200);
    expect(response.body.snapshotId).toBe(CONG_VIEN_MAU_SNAPSHOT.snapshotId);
    expect(response.body.isMock).toBe(true);
    expect(response.body.activities.length).toBeGreaterThanOrEqual(15);
    await request(app.getHttpServer()).get('/api/commerce/parks/khong-co/snapshot').expect(404);
  });

  it('kiểm lịch và tính lại tiền phía server', async () => {
    const response = await request(app.getHttpServer()).post(route).send(validateBody).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ valid: true, violations: [], totalVnd: 700_000, validatedBy: 'core-api' });
  });

  it('từ chối snapshot cũ (409) và body sai (400)', async () => {
    const stale = await request(app.getHttpServer()).post(route).send({ ...validateBody, snapshotId: 'CVM-old' }).expect(409);
    expect(stale.body).toMatchObject({ reason: 'SNAPSHOT_MISMATCH', currentSnapshotId: CONG_VIEN_MAU_SNAPSHOT.snapshotId });
    await request(app.getHttpServer()).post(route)
      .send({ ...validateBody, items: [{ kind: 'activity', id: 'A1', zone: 'KHU_A', start: '9h', end: '10:15' }] }).expect(400);
    await request(app.getHttpServer()).post(route).send({ ...validateBody, extra: true }).expect(400);
  });
});
