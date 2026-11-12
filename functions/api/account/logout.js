import { json } from '../../_lib/auth.js';
import { clearCookie } from '../../_lib/customer.js';
export const onRequestPost = () => json({ ok: true }, 200, { 'set-cookie': clearCookie() });
