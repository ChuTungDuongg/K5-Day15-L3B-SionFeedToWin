/**
 * Tạo Google Form khảo sát bản 2 (nhánh C3: hoàn/huỷ vé máy bay, phòng khách sạn).
 * Câu hỏi và lý do từng câu: evidence/survey/questions.md.
 *
 * Cách chạy: script.google.com → Dự án mới → dán file này → chọn createFormV2 → Chạy.
 * Chỉ TẠO form mới, không đụng form cũ và 9 câu trả lời bản 1.
 * Câu trả lời của form mới vào tab mới trong file sheet SHEET_ID.
 * Chạy một lần: chạy lại sẽ tạo thêm một form nữa.
 */
const SHEET_ID = '1R1LVJJ5cEEt2fV5qVkLiCmFQ7lWvdKWxFGRB-AwWJLU';

function createFormV2() {
  const form = FormApp.create(
    'Khảo sát trải nghiệm kiểm tra điều khoản hoàn/huỷ, đổi vé máy bay và phòng khách sạn nội địa'
  );
  form
    .setDescription(
      'Nhóm sinh viên đang tìm hiểu cách mọi người kiểm tra điều khoản hoàn/huỷ khi đặt vé máy bay, ' +
        'phòng khách sạn online. Khảo sát khoảng 3 phút, chỉ hỏi về lần gần nhất bạn gặp việc này. ' +
        'Không thu tên, email hay số điện thoại. Cảm ơn bạn!'
    )
    .setCollectEmail(false)
    .setProgressBar(true)
    .setConfirmationMessage('Cảm ơn bạn đã dành thời gian trả lời!');

  const SUBMIT = FormApp.PageNavigationType.SUBMIT;
  const CONTINUE = FormApp.PageNavigationType.CONTINUE;

  // Phần 1 — Google Form chỉ cho một câu rẽ nhánh mỗi phần, nên câu 2 và câu 3 ở hai phần.
  form
    .addMultipleChoiceItem()
    .setTitle('Bạn hiện là:')
    .setChoiceValues([
      'Sinh viên / Học viên',
      'Nhân viên văn phòng / Người đi làm',
      'Làm việc tự do / Kinh doanh',
    ])
    .showOtherOption(true)
    .setRequired(true);

  const q2 = form
    .addMultipleChoiceItem()
    .setTitle(
      'Trong 6 tháng qua, bạn có tự đặt vé máy bay nội địa hoặc phòng khách sạn online ' +
        '(Traveloka, Agoda, Booking, web/app hãng bay…) không?'
    )
    .setRequired(true);
  q2.setChoices([
    q2.createChoice('Có — cả vé máy bay và phòng khách sạn', CONTINUE),
    q2.createChoice('Có — chỉ vé máy bay nội địa', CONTINUE),
    q2.createChoice('Có — chỉ phòng khách sạn', CONTINUE),
    q2.createChoice('Chưa đặt trong 6 tháng qua', SUBMIT),
  ]);

  // Phần 2
  form.addPageBreakItem().setTitle('Lần gần nhất bạn kiểm tra điều khoản');
  const q3 = form
    .addMultipleChoiceItem()
    .setTitle(
      'Lần gần nhất bạn phải kiểm tra điều khoản hoàn/huỷ, hoặc đổi/hoàn vé, huỷ phòng ' +
        '(kể cả khi chuyến bay bị huỷ, đổi giờ) là khi nào?'
    )
    .setRequired(true);
  q3.setChoices([
    q3.createChoice('Trong 1 tuần qua', CONTINUE),
    q3.createChoice('Trong 1 tháng qua', CONTINUE),
    q3.createChoice('Từ 1–3 tháng trước', CONTINUE),
    q3.createChoice('Từ 3–6 tháng trước', CONTINUE),
    q3.createChoice('Chưa bao giờ', SUBMIT),
  ]);

  // Phần 3
  form.addPageBreakItem().setTitle('Lần gần nhất đó diễn ra thế nào');

  form
    .addTextItem()
    .setTitle(
      'Trong 3 tháng qua, bạn gặp việc phải kiểm tra hạn hoàn/huỷ hoặc xử lý đổi/hoàn vé, ' +
        'huỷ phòng bao nhiêu lần?'
    )
    .setHelpText('Nhập số, ví dụ: 0, 1, 2…')
    .setValidation(
      FormApp.createTextValidation()
        .requireNumberBetween(0, 100)
        .setHelpText('Nhập một số từ 0 đến 100')
        .build()
    )
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('Ở lần gần nhất, tình huống cụ thể của bạn là gì?')
    .setChoiceValues([
      'Kiểm tra điều khoản hoàn/huỷ trước khi bấm thanh toán',
      'Tự cân nhắc huỷ hoặc đổi vé máy bay nội địa',
      'Tự cân nhắc huỷ hoặc đổi ngày phòng khách sạn',
      'Chuyến bay bị hãng huỷ hoặc đổi giờ đột xuất (cần giữ chỗ / đổi chuyến / hoàn vé)',
    ])
    .showOtherOption(true)
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('Lần đó bạn đã đặt qua đâu?')
    .setChoiceValues([
      'Traveloka',
      'Agoda',
      'Booking.com',
      'Web / app của hãng bay',
      'Web / fanpage của khách sạn',
    ])
    .showOtherOption(true)
    .setRequired(true);

  form
    .addCheckboxItem()
    .setTitle('Ở lần đó, bạn đã kiểm tra điều khoản và xử lý bằng cách nào? (chọn nhiều)')
    .setChoiceValues([
      'Tự mở email xác nhận / màn hình đơn trên app/web để đọc và tự tính lùi mốc giờ (24h/48h/72h…)',
      'Gọi tổng đài hoặc nhắn CSKH của app đặt chỗ / hãng bay / khách sạn',
      'Hỏi bạn bè, người thân hoặc tìm trên Google / hội nhóm',
      'Hỏi công cụ AI (ChatGPT, Gemini…)',
      'Không kiểm tra kỹ, bấm huỷ/đổi luôn hoặc bỏ vé/phòng',
    ])
    .showOtherOption(true)
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle(
      'Từ lúc bắt đầu đọc điều khoản đến khi biết chắc mình có bị mất phí hay được đổi/hoàn ' +
        'thế nào, bạn mất khoảng bao lâu?'
    )
    .setChoiceValues([
      'Dưới 5 phút',
      '5–15 phút',
      '15–30 phút',
      'Trên 30 phút',
      'Không đọc, bấm luôn',
    ])
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('Kết quả của lần đó ra sao?')
    .setChoiceValues([
      'Biết rõ điều kiện và xử lý xong đúng ý (không mất tiền oan)',
      'Xử lý được nhưng vẫn lấn cấn / tốn nhiều công đối chiếu',
      'Bị mất phí mà lẽ ra có thể tránh được',
      'Bỏ cuộc, chấp nhận mất tiền hoặc không dám bấm huỷ/đổi',
    ])
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle('Lần đó bạn mất bao nhiêu tiền phí hoặc tiền không được hoàn?')
    .setChoiceValues([
      'Không mất đồng nào',
      'Dưới 200.000đ',
      '200.000đ – 500.000đ',
      '500.000đ – 1.000.000đ',
      'Trên 1.000.000đ',
      'Không nhớ',
    ])
    .setRequired(true);

  form
    .addCheckboxItem()
    .setTitle('Ở lần đó, chỗ nào khiến bạn khó nhất? (chọn nhiều)')
    .setChoiceValues([
      'Điều khoản dài, khó tìm đúng đoạn cần đọc',
      'Nhiều mốc giờ, không rõ tính từ giờ nào (giờ nhận phòng, giờ bay, giờ đặt…)',
      'App đặt chỗ và hãng bay / khách sạn nói khác nhau',
      'Không rõ được hoàn tiền hay voucher, bao lâu tiền về',
      'Chờ CSKH lâu hoặc CSKH trả lời không rõ',
      'Không thấy khó gì',
    ])
    .showOtherOption(true)
    .setRequired(true);

  form
    .addParagraphTextItem()
    .setTitle(
      'Nếu nhớ, hãy ghi lại câu chữ trong điều khoản (hoặc lời CSKH) khiến bạn phải đọc lại ' +
        'hoặc hỏi lại.'
    );

  form
    .addMultipleChoiceItem()
    .setTitle('Bạn có sẵn lòng cho nhóm hỏi thêm khoảng 10 phút không?')
    .setChoiceValues(['Có — để lại cách liên hệ ở câu dưới', 'Không']);

  form
    .addTextItem()
    .setTitle('Cách liên hệ (Zalo / email / Messenger)')
    .setHelpText('Không bắt buộc. Chỉ nhóm dùng để hẹn hỏi thêm.');

  form.setDestination(FormApp.DestinationType.SPREADSHEET, SHEET_ID);

  Logger.log('Link sửa form: ' + form.getEditUrl());
  Logger.log('Link gửi người trả lời: ' + form.getPublishedUrl());
}
