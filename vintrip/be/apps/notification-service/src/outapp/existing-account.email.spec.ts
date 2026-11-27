import { randomUUID } from 'node:crypto';
import { buildExistingAccountEmail } from './existing-account.email.js';

const payload = (hasPassword: boolean) => ({
  userId: randomUUID(),
  email: 'binh@example.com',
  displayName: 'Bình <i>',
  hasPassword,
});

describe('buildExistingAccountEmail', () => {
  it('báo email đã có tài khoản, có link đăng nhập và đặt lại mật khẩu, chống chèn HTML', () => {
    const mail = buildExistingAccountEmail(payload(true), 'https://vintrip.vn/');
    expect(mail.to).toBe('binh@example.com');
    expect(mail.subject).toBe('Email này đã có tài khoản Vintrip');
    expect(mail.text).toContain('https://vintrip.vn/login');
    expect(mail.text).toContain('https://vintrip.vn/forgot-password');
    expect(mail.html).toContain('href="https://vintrip.vn/login"');
    expect(mail.html).toContain('Đặt lại mật khẩu');
    expect(mail.html).toContain('Bình &lt;i&gt;');
    expect(mail.html).not.toContain('<i>');
  });

  it('tài khoản chỉ có Google: hướng dẫn tạo mật khẩu thay vì đặt lại', () => {
    const mail = buildExistingAccountEmail(payload(false), 'http://localhost:3100');
    expect(mail.text).toContain('đăng nhập bằng Google');
    expect(mail.html).toContain('Tạo mật khẩu');
    expect(mail.text).toContain('http://localhost:3100/forgot-password');
  });
});
