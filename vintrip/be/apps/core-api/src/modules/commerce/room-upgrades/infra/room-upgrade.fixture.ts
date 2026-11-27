import { SnapshotSchema, type Snapshot } from '../domain/room-upgrade.js';
import { nightDates } from '../domain/quote-primitives.js';

export const DEMO_HOTEL_ID = 'upgrade-demo-hotel';
export const UPGRADE_FIXTURE_VERSION = 'room-upgrades-v1';
export function offsetDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** All operational values below are synthetic assumptions, never user research or PMS data. */
export function createRoomUpgradeFixture(anchor: string): Snapshot {
  const mock = { isMock: true as const, version: 1 };
  const hotelId = DEMO_HOTEL_ID;
  const roomTypes: Snapshot['roomTypes'] = [
    { ...mock, hotelId, id: 'STD', name: 'Tiêu chuẩn', rank: 1, maxGuests: 2, features: ['NON_SMOKING'] },
    { ...mock, hotelId, id: 'DLX', name: 'Deluxe hướng vườn', rank: 2, maxGuests: 2, features: ['NON_SMOKING', 'GARDEN_VIEW'] },
    { ...mock, hotelId, id: 'STE', name: 'Suite gia đình', rank: 3, maxGuests: 4, features: ['NON_SMOKING', 'GARDEN_VIEW', 'ACCESSIBLE'] },
  ];
  const bookings: Snapshot['bookings'] = Array.from({ length: 10 }, (_, i) => {
    const status = i === 7 ? 'CHECKED_OUT' : i === 8 ? 'CONFIRMED' : 'IN_HOUSE';
    const checkIn = offsetDate(anchor, i === 7 ? -4 : i === 8 ? 1 : -1);
    const checkOut = offsetDate(anchor, i === 7 ? -1 : i === 8 ? 4 : 3);
    const bookingCode = `C2-${String(i + 1).padStart(4, '0')}`;
    const roomTypeId = i === 3 ? 'DLX' : i === 4 ? 'STE' : 'STD';
    const paidVnd = i === 9 ? 2_000_000 : roomTypeId === 'STE' ? 2_200_000 : roomTypeId === 'DLX' ? 1_500_000 : 1_200_000;
    return { ...mock, hotelId, bookingCode, roomNumber: String(101 + i), roomTypeId, status,
      checkInAt: `${checkIn}T14:00:00+07:00`, checkOutAt: `${checkOut}T12:00:00+07:00`, guests: i === 4 ? 3 : 2,
      nights: nightDates(checkIn, checkOut).map((date) => ({ date, paidVnd, creditEligibleVnd: paidVnd,
        taxIncluded: true as const, sourceRef: `${UPGRADE_FIXTURE_VERSION}:booking:${bookingCode}:${date}` })),
    };
  });
  const dates = nightDates(offsetDate(anchor, -1), offsetDate(anchor, 7));
  const from = `${offsetDate(anchor, -30)}T00:00:00+07:00`;
  const until = `${offsetDate(anchor, 90)}T00:00:00+07:00`;
  return SnapshotSchema.parse({
    hotel: { ...mock, id: hotelId, name: 'Khách sạn VinTrip Mẫu — dữ liệu mô phỏng', timezone: 'Asia/Ho_Chi_Minh', fixtureVersion: `${UPGRADE_FIXTURE_VERSION}@${anchor}` },
    roomTypes, bookings,
    inventory: roomTypes.flatMap((r) => dates.map((date) => ({ ...mock, hotelId, roomTypeId: r.id, date,
      total: r.id === 'STD' ? 20 : 10, held: 1, sold: r.id === 'STD' ? 8 : 2, outOfService: 1, stopSell: false }))),
    rates: roomTypes.flatMap((r) => dates.map((date) => ({ ...mock, hotelId, roomTypeId: r.id, date,
      priceVnd: r.id === 'STD' ? 1_350_000 : r.id === 'DLX' ? 1_500_000 : 2_200_000,
      taxIncluded: true, sourceRef: `${UPGRADE_FIXTURE_VERSION}:rate:${r.id}:${date}` }))),
    policies: [{ ...mock, hotelId, code: 'STAY-UPGRADE', validFrom: from, validUntil: until,
      rules: { nightRule: 'FULL_LOCAL_NIGHT', originalCreditBps: 10_000, changeFeeVnd: 0, feeTaxIncluded: true,
        taxBps: 1_000, maxNights: 30, quoteTtlMinutes: 15, maxReceptionistDiffVnd: 3_000_000,
        allowedTransitions: roomTypes.flatMap((a) => roomTypes.filter((b) => a.id !== b.id).map((b) => ({ from: a.id, to: b.id }))),
        allowedBenefitCodes: ['GOLD-10', 'VIP-FREE'] },
      sources: [
        { code: 'TIME', clause: 'Tính đủ một đêm cho mỗi ngày địa phương từ ngày chuyển đến trước ngày checkout; không chia theo giờ. Ngày checkout không là một đêm mới.' },
        { code: 'CREDIT', clause: 'Đối trừ 100% giá trị đủ điều kiện đã ghi trên từng đêm booking gốc, không dùng giá niêm yết hiện tại.' },
        { code: 'TAX', clause: 'Giá đã gồm thuế không cộng lại; giá và phí chưa gồm thuế áp dụng 10%. Làm tròn half-up từng khoản đến VND.' },
        { code: 'BENEFIT', clause: 'Quyền lợi xác minh giảm phần chênh dương trước phí/thuế theo từng đêm; không cộng dồn, chọn mức cao nhất còn hiệu lực.' },
        { code: 'APPROVAL', clause: 'Mọi báo giá chờ người duyệt. Chênh âm, miễn phí ngoài quyền lợi hoặc vượt 3.000.000đ chuyển quản lý; không tự hoàn tiền hay chuyển phòng.' },
      ] }],
    benefits: [
      { ...mock, hotelId, id: 'gold-0002', bookingCode: 'C2-0002', code: 'GOLD-10', verifiedAt: from, validFrom: from, validUntil: until, discountBps: 1_000, roomTypeIds: ['DLX', 'STE'] },
      { ...mock, hotelId, id: 'vip-0003', bookingCode: 'C2-0003', code: 'VIP-FREE', verifiedAt: from, validFrom: from, validUntil: until, discountBps: 10_000, roomTypeIds: ['DLX'] },
      { ...mock, hotelId, id: 'unverified-0006', bookingCode: 'C2-0006', code: 'VIP-FREE', verifiedAt: null, validFrom: from, validUntil: until, discountBps: 10_000, roomTypeIds: ['DLX'] },
    ],
  });
}
