# Theo dõi ticket giao diện — Antigravity (`fe-antigravity`)

> Worktree: `C:\Users\PC\Documents\GitHub\K5-Day15-fe-antigravity` · Nhánh: `fe-antigravity` · Không sửa `docs/tracker/FE-BOARD.md`.

| Mã | Trạng thái | File đã sửa | Lệnh kiểm và kết quả | Ghi chú |
|---|---|---|---|---|
| FE-06 | KẸT: chờ đặc tả FE-02 | — | Kiểm nền `vintrip/fe` (commit `a3267ec`): `pnpm install --frozen-lockfile` đạt (198 packages); `pnpm typecheck` đạt 6/7 gói, `@vintrip/web` chỉ lỗi sẵn có thiếu `../../app/auth/google/mobile/route` (`src/features/auth/mobile-google-return.test.ts`); `pnpm test` đạt 5/6 gói, `@vintrip/web` 90/92 file (574/576 test), trượt `mobile-google-return.test.ts` (thiếu route có sẵn) và 2 test sẵn có tại `src/features/discovery/search-params.test.ts` (dòng 15, 149: expected `'nha-trang'`, received `'ha-noi'`) | `docs/design/fe-redesign.md` mới có Mục 1 (FE-01), chưa có mục đặc tả trang khách sạn (FE-02 đang `TODO`). Dừng chờ PM bổ sung FE-02, không tự thiết kế. |
| FE-07 | KẸT: chờ đặc tả FE-02 | — | Như kiểm nền FE-06 ở trên | `docs/design/fe-redesign.md` chưa có mục đặc tả trang vé máy bay (FE-02 đang `TODO`). Dừng chờ PM bổ sung FE-02, không tự thiết kế. |
| FE-09 | KẸT: chờ đặc tả FE-02 | — | Như kiểm nền FE-06 ở trên | `docs/design/fe-redesign.md` chưa có mục đặc tả trợ lý Vini, giỏ hàng, thanh toán, đặt chỗ, tài khoản, đăng nhập (FE-02 đang `TODO`). Dừng chờ PM bổ sung FE-02, không tự thiết kế. |

## Yêu cầu gửi PM

1. **Chờ đặc tả `FE-02` trong `docs/design/fe-redesign.md`:** Hiện tài liệu mới có Mục 1 (`FE-01`), chưa có mục đặc tả từng trang cho `FE-06`, `FE-07`, `FE-09`. Theo quy trình, Antigravity ghi `KẸT` và chờ PM hoàn thành `FE-02`, không tự thiết kế hay sửa file giao diện.
2. **Lỗi test sẵn có ở vùng của Codex (`features/discovery/**`):** Khi chạy `pnpm test` nền trong `vintrip/fe`, `apps/web/src/features/discovery/search-params.test.ts` trượt 2 test (dòng 15 và 149: `expected 'ha-noi' to be 'nha-trang'`). Vùng `features/discovery/**` thuộc quyền Codex (ngoài phạm vi Antigravity), nhờ PM chuyển cho Codex kiểm tra.
