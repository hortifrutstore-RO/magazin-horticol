"""Generează datele de acces pentru panou. Rulare: python3 tools/setup_admin.py
Afișează valorile de pus ca secrete în Cloudflare Pages și salvează codul QR pentru aplicația de autentificare."""
import os, hashlib, secrets, base64, getpass, sys, urllib.parse
pw = sys.argv[1] if len(sys.argv) > 1 else getpass.getpass('Parola pentru panou (min. 12 caractere): ')
if len(pw) < 12: sys.exit('Parola trebuie să aibă cel puțin 12 caractere.')
salt = secrets.token_bytes(16); it = 100000  # limita maximă suportată de Cloudflare Workers
h = hashlib.pbkdf2_hmac('sha256', pw.encode(), salt, it, 32)
totp = base64.b32encode(secrets.token_bytes(20)).decode().rstrip('=')
sess = secrets.token_urlsafe(48)
uri = 'otpauth://totp/' + urllib.parse.quote('magazin-horticol.ro:admin') + f'?secret={totp}&issuer=magazin-horticol.ro&digits=6&period=30'
print('\nPune aceste trei secrete în Cloudflare Pages → Settings → Variables and Secrets:\n')
print(f'ADMIN_PASSWORD_HASH = pbkdf2${it}${salt.hex()}${h.hex()}')
print(f'ADMIN_TOTP_SECRET   = {totp}')
print(f'SESSION_SECRET      = {sess}\n')
try:
    import qrcode; qrcode.make(uri).save('qr-autentificare.png')
    print('Scanează qr-autentificare.png cu Google Authenticator / Microsoft Authenticator, apoi șterge fișierul.')
except ImportError:
    print('Adaugă manual în aplicația de autentificare cheia:', totp)
