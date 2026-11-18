'use strict';
// Prints SQL to reset the main admin's password on Cloudflare D1:  node scripts/reset-admin-sql.js "NewPassword123"
const crypto = require('node:crypto'); const pw = process.argv[2] || '';
if (pw.length < 10 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) { console.error('Password: at least 10 characters with letters and numbers.'); process.exit(1); }
const salt = crypto.randomBytes(16); const h = crypto.pbkdf2Sync(pw, salt, 100000, 32, 'sha256');
console.log(`UPDATE admins SET password_hash = 'pbkdf2$100000$${salt.toString('base64')}$${h.toString('base64')}', must_change = 1, failed_attempts = 0, locked_until = 0 WHERE username = 'prabesh';`);
