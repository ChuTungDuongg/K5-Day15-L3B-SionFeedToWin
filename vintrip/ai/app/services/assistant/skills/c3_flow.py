"""C3 · Chuyến bay bị huỷ: giữ chỗ, đổi vé, yêu cầu hoàn. Luồng có trạng thái, MÔ PHỎNG.

Chỉ dùng thư viện chuẩn để `codebase/tools.py` nạp được mà không cần FastAPI.
`MockSupplier` là adapter nhà cung cấp giả lập trong bộ nhớ: không gọi hãng, không chạm tiền
thật. Mọi dữ liệu (booking TRV-7Q2K, chuyến, giá, chính sách) là tự dựng cho demo.
"""

import copy
import hashlib
import re
import unicodedata
from datetime import datetime, timedelta, timezone

MOCK = "Mô phỏng"
TZ = timezone(timedelta(hours=7))
TOOL_NAMES = (
    "get_disrupted_booking",
    "get_disruption_policy",
    "find_alternative_flights",
    "hold_alternative",
    "quote_exchange",
    "commit_exchange",
    "quote_refund",
    "request_refund",
    "get_transaction_status",
    "handoff_to_staff",
)


def _flight(fid, dep, arr, seats, adt, chd, day="2026-12-11", status="SCHEDULED"):
    return {
        "id": fid,
        "from": "HAN",
        "to": "SGN",
        "status": status,
        "seats": seats,
        "departure": f"{day}T{dep}:00+07:00",
        "arrival": f"{day}T{arr}:00+07:00",
        "farePerPax": {"ADT": adt, "CHD": chd},
    }


SEED = {
    "policy": {
        "code": "DEMO-IROP-V1",
        "exchangeFeeVnd": 0,
        "windowHours": 72,
        "autoHoldAllowed": True,
        "holdMinutes": 20,
        "refundFeeVnd": 0,
        "refundDays": "7–30 ngày",
        "clause": (
            "Quy tắc mô phỏng: hãng huỷ chuyến thì được đổi miễn phí sang chuyến cùng "
            "hành trình trong 72 giờ (thu chênh lệch nếu giá mới cao hơn) hoặc hoàn toàn "
            "bộ giá vé chưa sử dụng, phí 0đ. Không phải chính sách của hãng bay thật."
        ),
    },
    "bookings": {
        "TRV-7Q2K": {
            "code": "TRV-7Q2K",
            "version": 1,
            "exchangeUsed": False,
            "paidVnd": 3400000,
            "passengers": [
                {"id": "P1", "type": "ADT", "label": "Người lớn"},
                {"id": "P2", "type": "CHD", "label": "Trẻ em", "guardian": "P1"},
            ],
            "segment": {
                "flight": "VT-DEMO-215",
                "from": "HAN",
                "to": "SGN",
                "departure": "2026-12-10T19:00:00+07:00",
                "status": "CANCELLED",
                "reason": "WEATHER",
            },
            "tickets": {
                "P1": {"number": "DEMO-TKT-0001", "status": "OPEN", "fareVnd": 1900000},
                "P2": {"number": "DEMO-TKT-0002", "status": "OPEN", "fareVnd": 1500000},
            },
        },
        "TRV-UM01": {  # trẻ em bay một mình: luôn chuyển nhân viên
            "code": "TRV-UM01",
            "version": 1,
            "exchangeUsed": False,
            "paidVnd": 1500000,
            "passengers": [{"id": "P1", "type": "CHD", "label": "Trẻ em"}],
            "segment": {
                "flight": "VT-DEMO-215",
                "from": "HAN",
                "to": "SGN",
                "departure": "2026-12-10T19:00:00+07:00",
                "status": "CANCELLED",
                "reason": "WEATHER",
            },
            "tickets": {"P1": {"number": "DEMO-TKT-0101", "status": "OPEN", "fareVnd": 1500000}},
        },
    },
    "flights": {
        f["id"]: f
        for f in (
            _flight("VT-DEMO-301", "06:15", "08:25", 1, 1900000, 1500000),
            _flight("VT-DEMO-303", "07:30", "09:40", 5, 1900000, 1500000),
            _flight("VT-DEMO-305", "09:45", "11:55", 4, 2050000, 1650000),
            _flight("VT-DEMO-311", "14:00", "16:10", 9, 1900000, 1500000),
            _flight("VT-DEMO-399", "08:00", "10:10", 9, 1900000, 1500000, status="CANCELLED"),
        )
    },
}


class SupplierTimeout(TimeoutError):
    """Nhà cung cấp không trả lời: chưa biết lệnh đã được thực hiện hay chưa."""


class MockSupplier:
    """Adapter nhà cung cấp có trạng thái, toàn bộ trong bộ nhớ (Mô phỏng)."""

    def __init__(self, now=None):
        self.data = copy.deepcopy(SEED)
        self.now = now or datetime(2026, 12, 10, 16, tzinfo=TZ)
        self.holds, self.proposals, self.tx, self.idem, self.handoffs = {}, {}, {}, {}, []
        self.fail_next = None  # "timeout_before_apply" | "timeout_after_apply"
        self.seq = 0

    def __repr__(self):
        return f"MockSupplier({MOCK})"

    def next_id(self, prefix):
        self.seq += 1
        return f"{prefix}-{self.seq:04d}"

    def booking(self, code):
        return self.data["bookings"].get(code)

    def active_hold(self, hold_id):
        hold = self.holds.get(hold_id)
        if hold and hold["status"] == "ACTIVE" and self.now >= hold["expiresAt"]:
            self.release(hold_id, "EXPIRED")
        return hold if hold and hold["status"] == "ACTIVE" else None

    def release(self, hold_id, status="RELEASED"):
        hold = self.holds[hold_id]
        if hold["status"] == "ACTIVE":
            self.data["flights"][hold["flightId"]]["seats"] += len(hold["passengerIds"])
            hold["status"] = status

    def settle_refund(self, tx_id):
        """Giả lập hãng/cổng thanh toán báo hoàn tất: bằng chứng duy nhất để chuyển REFUNDED."""
        tx = self.tx[tx_id]
        tx.update(status="SETTLED", evidence=f"DEMO-SETTLE-{tx_id}")
        for ticket in self.booking(tx["bookingCode"])["tickets"].values():
            if ticket["status"] == "REFUND_PENDING":
                ticket["status"] = "REFUNDED"


def _amount_due(booking, flight, policy):
    old = sum(t["fareVnd"] for t in booking["tickets"].values())
    new = sum(flight["farePerPax"][p["type"]] for p in booking["passengers"])
    return policy["exchangeFeeVnd"] + max(0, new - old)


def _minor_alone(booking, passenger_ids):
    """Đúng khi booking chỉ có trẻ em, hoặc phạm vi tách trẻ em khỏi người lớn đi kèm."""
    ids, pax = set(passenger_ids), booking["passengers"]
    if not any(p["type"] == "ADT" for p in pax):
        return True
    return any(p["type"] == "CHD" and (p["id"] in ids) != (p.get("guardian") in ids) for p in pax)


# ---- công cụ: mỗi hàm nhận adapter làm tham số đầu, codebase/tools.py bọc @tool


def get_disrupted_booking(supplier, booking_code):
    """Tên: get_disrupted_booking · đọc booking và chặng bị gián đoạn.
    Input: adapter, mã đặt chỗ. Output: booking (bản sao), disrupted, minorAlone.
    Tác động ra ngoài: không (chỉ đọc adapter mô phỏng).
    """
    booking = supplier.booking(booking_code)
    if booking is None:
        return {"ok": False, "code": "NOT_FOUND", "isMock": True}
    return {
        "ok": True,
        "isMock": True,
        "booking": copy.deepcopy(booking),
        "disrupted": booking["segment"]["status"] == "CANCELLED",
        "minorAlone": _minor_alone(booking, [p["id"] for p in booking["passengers"]]),
    }


def get_disruption_policy(supplier, booking_code):
    """Tên: get_disruption_policy · chính sách đổi/hoàn giả lập cho chặng bị huỷ.
    Input: adapter, mã đặt chỗ. Output: điều khoản, phí, thời hạn giữ chỗ.
    Tác động ra ngoài: không.
    """
    booking = supplier.booking(booking_code)
    return {
        **copy.deepcopy(supplier.data["policy"]),
        "isMock": True,
        "applies": bool(booking and booking["segment"]["status"] == "CANCELLED"),
    }


def find_alternative_flights(supplier, booking_code, next_morning=True):
    """Tên: find_alternative_flights · chuyến thay thế đủ chỗ cho cả nhóm.
    Input: adapter, mã đặt chỗ, chỉ lấy sáng hôm sau hay không.
    Output: options (đủ chỗ cả nhóm, số tiền phải trả), rejected (lý do).
    Tác động ra ngoài: không.
    """
    booking, policy = supplier.booking(booking_code), supplier.data["policy"]
    seg, group = booking["segment"], len(booking["passengers"])
    old_dep = datetime.fromisoformat(seg["departure"])
    options, rejected = [], []
    for flight in supplier.data["flights"].values():
        dep = datetime.fromisoformat(flight["departure"])
        reasons = []
        if (flight["from"], flight["to"]) != (seg["from"], seg["to"]):
            reasons.append("Khác hành trình")
        if flight["status"] != "SCHEDULED":
            reasons.append("Chuyến không khai thác")
        if flight["seats"] < group:
            reasons.append(f"Chỉ còn {flight['seats']} ghế, không đủ cho cả nhóm {group} khách")
        if dep <= supplier.now or dep - old_dep > timedelta(hours=policy["windowHours"]):
            reasons.append("Ngoài khung giờ chính sách")
        if next_morning and (dep.date() != old_dep.date() + timedelta(days=1) or dep.hour >= 12):
            reasons.append("Không phải buổi sáng hôm sau")
        if reasons:
            rejected.append({"id": flight["id"], "reasons": reasons})
            continue
        due = _amount_due(booking, flight, policy)
        options.append(
            {
                "id": flight["id"],
                "departure": flight["departure"],
                "arrival": flight["arrival"],
                "amountDueVnd": due,
                "autoHoldEligible": policy["autoHoldAllowed"] and due == 0,
            }
        )
    options.sort(key=lambda o: o["departure"])
    return {"isMock": True, "options": options, "rejected": rejected}


def hold_alternative(supplier, booking_code, flight_id, passenger_ids=None):
    """Tên: hold_alternative · giữ chỗ tạm cho cả nhóm trên chuyến thay thế.
    Input: adapter, mã đặt chỗ, mã chuyến, danh sách khách (mặc định cả nhóm).
    Output: hold có thời hạn, hoặc lỗi; giữ thiếu chỗ thì giải phóng phần đã giữ.
    Tác động ra ngoài: chỉ trên adapter mô phỏng; không thu phí, không tiêu quyền đổi,
    không huỷ vé gốc.
    """
    booking, policy = supplier.booking(booking_code), supplier.data["policy"]
    flight = supplier.data["flights"].get(flight_id)
    ids = passenger_ids or [p["id"] for p in booking["passengers"]]
    if _minor_alone(booking, ids):
        return {"ok": False, "code": "MINOR_UNACCOMPANIED", "isMock": True}
    if flight is None or flight["status"] != "SCHEDULED":
        return {"ok": False, "code": "FLIGHT_UNAVAILABLE", "isMock": True}
    if not policy["autoHoldAllowed"] or _amount_due(booking, flight, policy) != 0:
        return {"ok": False, "code": "HOLD_NOT_FREE", "isMock": True}
    if booking["exchangeUsed"] or any(t["status"] != "OPEN" for t in booking["tickets"].values()):
        return {"ok": False, "code": "TICKET_NOT_OPEN", "isMock": True}
    for hold in supplier.holds.values():  # một booking chỉ giữ một phương án
        if hold["bookingCode"] == booking_code:
            supplier.release(hold["holdId"])
    taken = 0
    for _ in ids:  # giữ từng ghế như API hãng; thiếu ghế thì trả lại hết
        if flight["seats"] == 0:
            flight["seats"] += taken
            return {"ok": False, "code": "PARTIAL_RELEASED", "held": 0, "isMock": True}
        flight["seats"] -= 1
        taken += 1
    hold = {
        "holdId": supplier.next_id("HOLD"),
        "bookingCode": booking_code,
        "flightId": flight_id,
        "passengerIds": list(ids),
        "status": "ACTIVE",
        "expiresAt": supplier.now + timedelta(minutes=policy["holdMinutes"]),
    }
    supplier.holds[hold["holdId"]] = hold
    return {"ok": True, "isMock": True, **copy.deepcopy(hold)}


def _token(proposal_id, version, amount):
    return hashlib.sha256(f"{proposal_id}|{version}|{amount}".encode()).hexdigest()[:12]


def quote_exchange(supplier, booking_code, flight_id, hold_id=None):
    """Tên: quote_exchange · báo giá đổi vé cả nhóm, kèm token xác nhận.
    Input: adapter, mã đặt chỗ, mã chuyến, mã giữ chỗ (nếu có).
    Output: proposal (proposalId, bookingVersion, amountDueVnd, confirmationToken).
    Tác động ra ngoài: không.
    """
    booking = supplier.booking(booking_code)
    flight = supplier.data["flights"][flight_id]
    due = _amount_due(booking, flight, supplier.data["policy"])
    pid = supplier.next_id("PRP")
    proposal = {
        "proposalId": pid,
        "kind": "EXCHANGE",
        "bookingCode": booking_code,
        "bookingVersion": booking["version"],
        "flightId": flight_id,
        "holdId": hold_id,
        "passengerIds": [p["id"] for p in booking["passengers"]],
        "amountDueVnd": due,
        "confirmationToken": _token(pid, booking["version"], due),
    }
    supplier.proposals[pid] = proposal
    return {"ok": True, "isMock": True, **copy.deepcopy(proposal)}


def _remember(supplier, key, result):
    supplier.idem[key] = copy.deepcopy(result)
    return result


def commit_exchange(supplier, proposal_id, confirmation_token, idempotency_key):
    """Tên: commit_exchange · đổi vé theo proposal đã được người dùng xác nhận.
    Input: adapter, proposalId, token xác nhận, khoá chống lặp.
    Output: kết quả đổi (gửi lại cùng khoá trả kết quả cũ) hoặc mã lỗi.
    Tác động ra ngoài: chỉ trên adapter mô phỏng; bản thật cần người duyệt. Xuất vé mới trước,
    rồi mới đánh dấu vé gốc EXCHANGED.
    """
    if idempotency_key in supplier.idem:
        return {**copy.deepcopy(supplier.idem[idempotency_key]), "replayed": True}
    proposal = supplier.proposals.get(proposal_id)
    if (
        proposal is None
        or proposal["kind"] != "EXCHANGE"
        or confirmation_token != proposal["confirmationToken"]
    ):
        return {"ok": False, "code": "TOKEN_INVALID", "isMock": True}
    booking = supplier.booking(proposal["bookingCode"])
    flight = supplier.data["flights"][proposal["flightId"]]
    if booking["version"] != proposal["bookingVersion"]:
        return {"ok": False, "code": "VERSION_CONFLICT", "isMock": True}
    if any(
        t["status"] == "PENDING" and t["bookingCode"] == booking["code"]
        for t in supplier.tx.values()
    ):
        return {"ok": False, "code": "IN_PROGRESS", "isMock": True}
    hold = proposal["holdId"] and supplier.active_hold(proposal["holdId"])
    if proposal["holdId"] and not hold:
        return {"ok": False, "code": "HOLD_EXPIRED", "isMock": True}
    if _amount_due(booking, flight, supplier.data["policy"]) != proposal["amountDueVnd"]:
        return {"ok": False, "code": "PRICE_CHANGED", "isMock": True}
    if not hold and flight["seats"] < len(proposal["passengerIds"]):
        return {"ok": False, "code": "SEATS_GONE", "isMock": True}
    if supplier.fail_next == "timeout_before_apply":
        supplier.fail_next = None
        raise SupplierTimeout("nhà cung cấp mô phỏng không trả lời")
    # Xuất vé mới trước; chỉ khi đủ vé mới mới đổi trạng thái vé gốc (không huỷ trước).
    new = {
        pid: {"number": supplier.next_id("DEMO-TKT"), "status": "ISSUED", "flight": flight["id"]}
        for pid in proposal["passengerIds"]
    }
    for pid in proposal["passengerIds"]:
        booking["tickets"][pid].update(status="EXCHANGED", exchangedTo=new[pid]["number"])
    if hold:
        hold["status"] = "CONSUMED"
    else:
        flight["seats"] -= len(proposal["passengerIds"])
    booking.update(
        version=booking["version"] + 1,
        exchangeUsed=True,
        newTickets=new,
        paidVnd=booking["paidVnd"] + proposal["amountDueVnd"],
    )
    booking["segment"] = {
        **booking["segment"],
        "flight": flight["id"],
        "departure": flight["departure"],
        "status": "CONFIRMED",
    }
    tx = {
        "txId": supplier.next_id("TX"),
        "kind": "EXCHANGE",
        "status": "COMPLETED",
        "bookingCode": booking["code"],
        "idempotencyKey": idempotency_key,
    }
    supplier.tx[tx["txId"]] = tx
    result = _remember(
        supplier,
        idempotency_key,
        {
            "ok": True,
            "isMock": True,
            "txId": tx["txId"],
            "flightId": flight["id"],
            "newTickets": copy.deepcopy(new),
            "chargedVnd": proposal["amountDueVnd"],
            "bookingVersion": booking["version"],
        },
    )
    if supplier.fail_next == "timeout_after_apply":  # đã đổi nhưng phản hồi bị mất
        supplier.fail_next = None
        raise SupplierTimeout("nhà cung cấp mô phỏng không trả lời")
    return result


def quote_refund(supplier, booking_code):
    """Tên: quote_refund · báo giá hoàn toàn bộ vé chưa dùng, kèm hậu quả và token.
    Input: adapter, mã đặt chỗ. Output: số tiền, phí, hậu quả, confirmationToken.
    Tác động ra ngoài: không.
    """
    booking, policy = supplier.booking(booking_code), supplier.data["policy"]
    amount = sum(t["fareVnd"] for t in booking["tickets"].values() if t["status"] == "OPEN")
    amount -= policy["refundFeeVnd"] if amount else 0
    pid = supplier.next_id("PRP")
    proposal = {
        "proposalId": pid,
        "kind": "REFUND",
        "bookingCode": booking_code,
        "bookingVersion": booking["version"],
        "amountVnd": amount,
        "feeVnd": policy["refundFeeVnd"],
        "refundDays": policy["refundDays"],
        "passengerIds": [p["id"] for p in booking["passengers"]],
        "confirmationToken": _token(pid, booking["version"], amount),
    }
    supplier.proposals[pid] = proposal
    return {"ok": True, "isMock": True, **copy.deepcopy(proposal)}


def request_refund(supplier, proposal_id, confirmation_token, idempotency_key):
    """Tên: request_refund · gửi yêu cầu hoàn sau xác nhận riêng của người dùng.
    Input: adapter, proposalId hoàn, token, khoá chống lặp.
    Output: giao dịch PENDING (chưa phải đã hoàn tiền).
    Tác động ra ngoài: chỉ trên adapter mô phỏng; bản thật cần người duyệt.
    """
    if idempotency_key in supplier.idem:
        return {**copy.deepcopy(supplier.idem[idempotency_key]), "replayed": True}
    proposal = supplier.proposals.get(proposal_id)
    if (
        proposal is None
        or proposal["kind"] != "REFUND"
        or confirmation_token != proposal["confirmationToken"]
    ):
        return {"ok": False, "code": "TOKEN_INVALID", "isMock": True}
    booking = supplier.booking(proposal["bookingCode"])
    if booking["version"] != proposal["bookingVersion"]:
        return {"ok": False, "code": "VERSION_CONFLICT", "isMock": True}
    for hold in supplier.holds.values():
        if hold["bookingCode"] == booking["code"]:
            supplier.release(hold["holdId"])
    for ticket in booking["tickets"].values():
        if ticket["status"] == "OPEN":
            ticket["status"] = "REFUND_PENDING"
    booking["version"] += 1
    tx = {
        "txId": supplier.next_id("TX"),
        "kind": "REFUND",
        "status": "PENDING",
        "bookingCode": booking["code"],
        "amountVnd": proposal["amountVnd"],
        "idempotencyKey": idempotency_key,
    }
    supplier.tx[tx["txId"]] = tx
    return _remember(supplier, idempotency_key, {"ok": True, "isMock": True, **tx})


def get_transaction_status(supplier, idempotency_key=None, tx_id=None):
    """Tên: get_transaction_status · tra trạng thái giao dịch theo khoá chống lặp hoặc txId.
    Input: adapter, idempotency_key hoặc tx_id. Output: giao dịch hoặc NOT_FOUND.
    Tác động ra ngoài: không.
    """
    for tx in supplier.tx.values():
        if tx["txId"] == tx_id or (idempotency_key and tx["idempotencyKey"] == idempotency_key):
            return {"isMock": True, **copy.deepcopy(tx)}
    return {"isMock": True, "status": "NOT_FOUND"}


def handoff_to_staff(supplier, booking_code, reason, summary):
    """Tên: handoff_to_staff · tạo phiếu chuyển nhân viên.
    Input: adapter, mã đặt chỗ, lý do, tóm tắt. Output: phiếu PENDING_STAFF.
    Tác động ra ngoài: chỉ tạo bản nháp chờ nhân viên duyệt, không gửi đi.
    """
    ticket = {
        "ticketId": supplier.next_id("HANDOFF"),
        "bookingCode": booking_code,
        "reason": reason,
        "summary": summary,
        "status": "PENDING_STAFF",
        "isMock": True,
    }
    supplier.handoffs.append(ticket)
    return copy.deepcopy(ticket)


# ---- hội thoại


def fold(text):
    value = unicodedata.normalize("NFD", text.lower().replace("đ", "d"))
    return "".join(c for c in value if not unicodedata.combining(c))


def vnd(amount):
    return f"{amount:,}".replace(",", ".") + "đ"


def hhmm(iso):
    return iso[11:16]


CODE = re.compile(r"\btrv-[a-z0-9]{4}\b")
STAFF = re.compile(
    r"\b(?:toi|minh|em|tui)\s+la\s+(?:nhan vien|staff|dai ly|agent)|"
    r"\bbo(?: qua)? (?:quy dinh|chinh sach|xac nhan|buoc)|override|cap quyen"
)
COMPENSATION = re.compile(r"\b(?:boi thuong|den bu|compensation)\b")
SCOPE_VERB = r"(?:(?:doi|hoan|giu)(?: ve)?\s+)?(?:cho\s+)?"
CHILD_ONLY = re.compile(
    r"\b(?:chi|rieng|mot minh)\s+" + SCOPE_VERB + r"(?:be|con|tre em|chau)\b|"
    r"\b(?:be|con|tre em|chau)\s+(?:bay|di)\s+mot minh\b"
)
ADULT_ONLY = re.compile(
    r"\b(?:chi|rieng)\s+" + SCOPE_VERB + r"(?:minh\s+)?(?:toi|nguoi lon|me|bo)\b|"
    r"\bmot minh toi\b"
)
NEGATION = r"\b(?:khong|dung|chua)(?: muon| can)?\s+"
REFUND = re.compile(r"\b(?:hoan tien|hoan ve|huy het|huy ve|huy booking|refund)\b")
CONFIRM_REFUND = re.compile(r"\bxac nhan hoan\b")
AFFIRM = re.compile(
    r"^\s*(?:u|uh|um|ok|oke|okay|dong y|xac nhan|duoc|chot|co)\b|"
    r"\b(?:xac nhan doi|dong y doi|thu lai)\b"
)
CHANGE = re.compile(r"\b(?:doi di|doi ve|doi chuyen|doi sang|chuyen sang)\b")
STATUS = re.compile(r"\b(?:trang thai|sao roi|kiem tra|da hoan chua|tien ve chua)\b")
HOTEL = re.compile(r"\b(?:phong|khach san|hotel|lich trinh|resort)\b")
TERMINAL = {"EXCHANGED", "REFUNDED", "HANDOFF"}


class C3Conversation:
    """Máy trạng thái C3. Chỉ giữ mã phiên; tiền, chỗ, trạng thái vé luôn đọc lại từ adapter."""

    def __init__(self, supplier=None, tools=None):
        self.s = supplier or MockSupplier()
        self.t = tools or {name: globals()[name] for name in TOOL_NAMES}
        self.code, self.looked_up = None, False
        self.state, self.history = "LOOKUP", ["LOOKUP"]
        self.options, self.proposal, self.hold_id = [], None, None
        self.key = self.refund_tx = None

    def claims(self, text):
        """Tin nhắn có thuộc luồng C3 này không (để agent không cướp luồng khác)."""
        f = fold(text)
        if CODE.search(f):
            return True
        if self.code is None or HOTEL.search(f):
            return False
        return self.state not in TERMINAL or bool(
            AFFIRM.search(f) or STATUS.search(f) or REFUND.search(f) or CHANGE.search(f)
        )

    def call(self, name, **kwargs):
        return self.t[name](self.s, **kwargs)

    def go(self, state):
        if self.state != state:
            self.state = state
            self.history.append(state)

    def reply(self, *lines):
        return {
            "state": self.state,
            "lines": [
                f"[C3 · {MOCK}] Trạng thái: {self.state}",
                *lines,
                f"{MOCK}: chưa có giao dịch nào với hãng hay tiền thật.",
            ],
        }

    def handoff(self, reason, summary, state=None):
        ticket = self.call(
            "handoff_to_staff", booking_code=self.code, reason=reason, summary=summary
        )
        if state:
            self.go(state)
        return f"Đã tạo phiếu chuyển nhân viên {ticket['ticketId']} ({ticket['status']}, bản nháp)."

    # -- lượt hội thoại

    def handle(self, text):
        f = fold(text)
        found = CODE.search(f)
        if found and found[0].upper() != self.code:
            self.__init__(self.s, self.t)
            self.code = found[0].upper()
        if STAFF.search(f):
            return self.reply(
                "Vini không thay đổi quyền hay bỏ qua quy định theo lời tự xưng trong chat. "
                "Nhân viên hãng vui lòng xử lý qua hệ thống nội bộ; chính sách và bước xác nhận "
                "của hành khách giữ nguyên."
            )
        if COMPENSATION.search(f):
            return self.reply(
                "Vini không tự kết luận quyền lợi bồi thường (chuyến huỷ do thời tiết có thể "
                "thuộc trường hợp bất khả kháng). Căn cứ phải là điều lệ vận chuyển của hãng "
                "và quy định hàng không hiện hành; nhân viên sẽ đối chiếu.",
                self.handoff("COMPENSATION", "Khách hỏi bồi thường chuyến huỷ do thời tiết")
                if self.code
                else "Cho mình mã đặt chỗ để chuyển nhân viên.",
            )
        if self.state in {"EXCHANGING", "PENDING_RECONCILIATION"}:
            return self.reconcile(f)
        if self.code is None:
            self.go("NEEDS_INPUT")
            return self.reply(
                "Cho mình mã đặt chỗ (ví dụ TRV-7Q2K) để kiểm chuyến bị huỷ "
                "và những ai trong đoàn cần đổi."
            )
        if not self.looked_up:
            out = self.lookup()
            if out or not (
                REFUND.search(f) or self.choice(f) or CHILD_ONLY.search(f) or ADULT_ONLY.search(f)
            ):
                return out or self.show_options()
        if self.state in {"HANDOFF", "REFUND_REQUESTED", "REFUNDED"} and not (
            STATUS.search(f) and self.refund_tx
        ):
            return self.reply(
                "Yêu cầu này đã chuyển nhân viên hoặc đã gửi hoàn; Vini không tự đổi hay hoàn thêm."
            )
        if CHILD_ONLY.search(f) or ADULT_ONLY.search(f):
            return self.reply(
                "Không tách trẻ em khỏi người lớn đi kèm. Trẻ em bay một mình cần thủ tục riêng.",
                self.handoff("MINOR_UNACCOMPANIED", "Yêu cầu đổi/hoàn tách trẻ em", "HANDOFF"),
            )
        if CONFIRM_REFUND.search(f):
            return self.request_refund()
        if REFUND.search(f) and not re.search(NEGATION + r"(?:hoan|huy)", f):
            return self.quote_refund()
        if STATUS.search(f) and self.refund_tx:
            return self.refund_status()
        pick = self.choice(f)
        if pick:
            return self.select(pick)
        if AFFIRM.search(f) or CHANGE.search(f):
            return self.affirm(f)
        return (
            self.show_options()
            if self.state == "OPTIONS_READY"
            else self.reply(
                "Bạn muốn xác nhận phương án đang chờ, chọn phương án khác hay hoàn vé?"
            )
        )

    def lookup(self):
        found = self.call("get_disrupted_booking", booking_code=self.code)
        if not found["ok"]:
            self.go("NEEDS_INPUT")
            return self.reply(f"Không thấy mã {self.code} trong dữ liệu mô phỏng; kiểm lại mã.")
        if not found["disrupted"]:
            self.go("NEEDS_INPUT")
            return self.reply("Chặng của booking này chưa bị huỷ; không có gì cần đổi.")
        if found["minorAlone"]:
            self.looked_up = True
            return self.reply(
                "Booking chỉ có trẻ em bay một mình: cần nhân viên hỗ trợ.",
                self.handoff("MINOR_UNACCOMPANIED", "Trẻ em bay một mình bị huỷ chuyến", "HANDOFF"),
            )
        self.looked_up = True
        self.call("get_disruption_policy", booking_code=self.code)
        self.options = self.call("find_alternative_flights", booking_code=self.code)["options"]
        if not self.options:
            self.go("NEEDS_INPUT")
            return self.reply(
                "Không còn chuyến sáng hôm sau đủ chỗ cho cả nhóm. Bạn muốn "
                "hoàn vé hay để nhân viên tìm thêm?"
            )
        self.go("OPTIONS_READY")
        if len(self.options) == 1 and self.options[0]["autoHoldEligible"]:
            return self.select(self.options[0])  # chính sách cho phép: tự giữ phương án duy nhất
        return None

    def booking_line(self):
        b = self.call("get_disrupted_booking", booking_code=self.code)["booking"]
        people = ", ".join(p["label"] for p in b["passengers"])
        seg = b["segment"]
        return (
            f"Booking {self.code}: chuyến {seg['flight']} {seg['from']}→{seg['to']} "
            f"({seg['status']}) · "
            f"{len(b['passengers'])} khách ({people})."
        )

    def show_options(self):
        lines = [self.booking_line(), "Phương án sáng hôm sau đủ chỗ cho cả nhóm:"]
        for i, o in enumerate(self.options, 1):
            lines.append(
                f"{i}) {o['id']} {hhmm(o['departure'])}→{hhmm(o['arrival'])} · "
                f"phải trả {vnd(o['amountDueVnd'])}"
            )
        lines.append("Bạn chọn phương án số mấy? Hoặc nói 'hoàn tiền' nếu không bay nữa.")
        return self.reply(*lines)

    def choice(self, f):
        m = re.search(r"\b(?:phuong an|lua chon|so|chon)\s*(\d)\b", f) or re.fullmatch(
            r"\s*(\d)\s*", f
        )
        if m and 1 <= int(m[1]) <= len(self.options):
            return self.options[int(m[1]) - 1]
        for o in self.options:
            h, mm = hhmm(o["departure"]).split(":")
            if o["id"].lower() in f or re.search(rf"\b0?{int(h)}(?:h|:|g){mm}\b", f):
                return o
        return None

    def select(self, option):
        hold_line = f"Phương án có thu {vnd(option['amountDueVnd'])} nên Vini không tự giữ chỗ."
        self.hold_id = None
        if option["autoHoldEligible"]:
            hold = self.call("hold_alternative", booking_code=self.code, flight_id=option["id"])
            if not hold["ok"]:
                self.options = self.call("find_alternative_flights", booking_code=self.code)[
                    "options"
                ]
                self.go("OPTIONS_READY" if self.options else "NEEDS_INPUT")
                return self.reply(
                    f"Không giữ được đủ chỗ cho cả nhóm trên {option['id']} "
                    f"({hold['code']}); không giữ một phần. Đã kiểm lại phương án.",
                    *self.show_options()["lines"][1:-1],
                )
            self.hold_id = hold["holdId"]
            self.go("HELD")
            hold_line = (
                f"Đã giữ chỗ ({MOCK}) {len(hold['passengerIds'])} ghế trên {option['id']} "
                f"đến {hold['expiresAt'].strftime('%H:%M')}; chưa đổi vé, vé gốc giữ "
                "nguyên."
            )
        return self.ask_exchange(option["id"], hold_line)

    def ask_exchange(self, flight_id, *lead):
        self.proposal = self.call(
            "quote_exchange", booking_code=self.code, flight_id=flight_id, hold_id=self.hold_id
        )
        self.go("AWAITING_CONFIRMATION")
        p = self.proposal
        flight = self.s.data["flights"][flight_id]
        return self.reply(
            *lead,
            f"Đề nghị đổi vé {self.code} cho cả {len(p['passengerIds'])} khách sang {flight_id} "
            f"{hhmm(flight['departure'])}→{hhmm(flight['arrival'])}, phải trả "
            f"{vnd(p['amountDueVnd'])} (proposal {p['proposalId']}, phiên bản booking "
            f"{p['bookingVersion']}).",
            "Gõ 'xác nhận đổi' để đổi; vé gốc chỉ chuyển trạng thái sau khi vé mới đã xuất.",
        )

    def affirm(self, f):
        if self.state == "EXCHANGED":
            return self.commit()  # cùng khoá chống lặp: trả lại kết quả cũ
        if self.proposal and self.proposal["kind"] == "REFUND":
            return self.reply("Hoàn vé cần xác nhận riêng: gõ đúng 'xác nhận hoàn'.")
        if self.state == "AWAITING_CONFIRMATION" and self.proposal:
            return self.commit()
        if self.state == "OPTIONS_READY" and len(self.options) > 1:
            return self.reply(
                f"Đang có {len(self.options)} phương án, Vini chưa biết bạn chọn "
                "chuyến nào cho cả nhóm.",
                *self.show_options()["lines"][2:-1],
            )
        return self.show_options()

    def commit(self):
        p = self.proposal
        self.key = (
            self.key
            if self.state in {"EXCHANGED", "PENDING_RECONCILIATION"}
            else f"{p['proposalId']}:v{p['bookingVersion']}"
        )
        if self.state != "EXCHANGED":
            self.go("EXCHANGING")
        try:
            out = self.call(
                "commit_exchange",
                proposal_id=p["proposalId"],
                confirmation_token=p["confirmationToken"],
                idempotency_key=self.key,
            )
        except TimeoutError:
            self.go("PENDING_RECONCILIATION")
            return self.reply(
                "Hãng (mô phỏng) không phản hồi; chưa rõ vé đã đổi hay chưa. "
                "Vini sẽ tra trạng thái giao dịch trước khi thử lại và chặn lệnh "
                f"đổi/hoàn mới cho {self.code} trong lúc đối soát."
            )
        return self.after_commit(out)

    def after_commit(self, out):
        if out["ok"]:
            self.go("EXCHANGED")
            tickets = ", ".join(t["number"] for t in out["newTickets"].values())
            return self.reply(
                (
                    "Lệnh này đã thực hiện trước đó; không đổi lần nữa. "
                    if out.get("replayed")
                    else ""
                )
                + f"Đã đổi vé ({MOCK}) sang {out['flightId']}: vé mới {tickets}; "
                f"đã thu {vnd(out['chargedVnd'])}; giao dịch {out['txId']}."
            )
        code = out["code"]
        if code == "PRICE_CHANGED":
            old = self.proposal["amountDueVnd"]
            return self.ask_exchange(
                self.proposal["flightId"],
                f"Giá đổi đã thay đổi (trước: {vnd(old)}); proposal cũ hết "
                "hiệu lực, cần xác nhận mới.",
            )
        self.proposal = None
        self.options = self.call("find_alternative_flights", booking_code=self.code)["options"]
        self.go("OPTIONS_READY" if self.options else "NEEDS_INPUT")
        reason = {
            "HOLD_EXPIRED": "Chỗ giữ đã hết hạn và được giải phóng",
            "VERSION_CONFLICT": "Booking vừa thay đổi ở nơi khác",
        }.get(code, code)
        return self.reply(
            f"{reason}; chưa đổi vé. Đã kiểm lại phương án, cần chọn và xác nhận lại.",
            *self.show_options()["lines"][1:-1],
        )

    def reconcile(self, f):
        tx = self.call("get_transaction_status", idempotency_key=self.key)
        if tx["status"] == "COMPLETED":
            self.go("EXCHANGED")
            out = self.call(
                "commit_exchange",
                proposal_id=self.proposal["proposalId"],
                confirmation_token=self.proposal["confirmationToken"],
                idempotency_key=self.key,
            )  # trả kết quả đã lưu, không đổi lần hai
            return self.after_commit(out)
        if AFFIRM.search(f):
            return self.commit()  # hãng chưa ghi nhận: thử lại với cùng khoá chống lặp
        return self.reply(
            f"Đang đối soát giao dịch đổi vé {self.code} (khoá {self.key}): hãng "
            "chưa ghi nhận. Chặn lệnh đổi/hoàn mới; gõ 'thử lại' để gửi lại "
            "đúng lệnh cũ."
        )

    def quote_refund(self):
        if self.state == "EXCHANGED":
            return self.reply("Vé đã đổi sang chuyến mới; hoàn vé đã đổi cần nhân viên xử lý.")
        q = self.call("quote_refund", booking_code=self.code)
        self.proposal = q
        self.go("AWAITING_CONFIRMATION")
        held = " Chỗ đang giữ sẽ được giải phóng." if self.hold_id else ""
        return self.reply(
            self.booking_line(),
            f"Phạm vi: huỷ hành trình và hoàn toàn bộ vé chưa dùng cho cả "
            f"{len(q['passengerIds'])} khách trong {self.code}.",
            f"Hoàn dự kiến {vnd(q['amountVnd'])} (phí {vnd(q['feeVnd'])}) về phương thức "
            f"thanh toán gốc trong {q['refundDays']}.",
            "Hậu quả: vé không dùng hay đổi được nữa, mất phương án bay sáng mai;" + held,
            "Nếu chỉ muốn hoàn cho một người, hãy nói rõ. Gõ đúng 'xác nhận hoàn' để gửi yêu cầu.",
        )

    def request_refund(self):
        p = self.proposal
        if not p or p["kind"] != "REFUND":
            return self.reply("Chưa có báo giá hoàn nào đang chờ; nói 'hoàn tiền' để xem trước.")
        self.key = f"{p['proposalId']}:v{p['bookingVersion']}"
        out = self.call(
            "request_refund",
            proposal_id=p["proposalId"],
            confirmation_token=p["confirmationToken"],
            idempotency_key=self.key,
        )
        if not out["ok"]:
            return self.quote_refund()
        self.refund_tx, self.hold_id = out["txId"], None
        self.go("REFUND_REQUESTED")
        return self.reply(
            f"Đã gửi yêu cầu hoàn ({MOCK}) {vnd(out['amountVnd'])}, giao dịch "
            f"{out['txId']} đang {out['status']}. Chưa phải đã hoàn tiền: chỉ báo "
            "hoàn tất khi có xác nhận giao dịch."
        )

    def refund_status(self):
        tx = self.call("get_transaction_status", tx_id=self.refund_tx)
        if tx["status"] == "SETTLED":
            self.go("REFUNDED")
            return self.reply(
                f"Giao dịch hoàn {tx['txId']} đã hoàn tất ({MOCK}), bằng chứng {tx['evidence']}."
            )
        return self.reply(
            f"Giao dịch hoàn {tx['txId']} vẫn {tx['status']}; chưa có xác nhận tiền đã về."
        )
