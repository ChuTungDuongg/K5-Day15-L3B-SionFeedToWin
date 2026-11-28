import { buildMobileGoogleRedirect, readMobileGoogleReturn } from '../../../../features/auth/mobile-google-return';

function readFormField(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === 'string' ? value : null;
}

/** Nhận form POST từ Google rồi chuyển ID token (hoặc mã lỗi) về app di động qua fragment `#`. */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData().catch(() => null);
  if (!form) return new Response(null, { status: 400 });

  const state = readFormField(form, 'state');
  const idToken = readFormField(form, 'id_token');
  const error = readFormField(form, 'error');

  const target = readMobileGoogleReturn(state);
  if (!target) return new Response(null, { status: 400 });

  const location = buildMobileGoogleRedirect(
    target,
    idToken ? { idToken } : { error: error ?? 'missing_token' },
  );
  return new Response(null, {
    status: 303,
    headers: { Location: location },
  });
}
