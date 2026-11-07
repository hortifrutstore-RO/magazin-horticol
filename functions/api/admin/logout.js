import { cookieHeader, json } from '../../_lib/auth.js';
export const onRequestPost = () => json({ ok: true }, 200, { 'set-cookie': cookieHeader('', 0) });
