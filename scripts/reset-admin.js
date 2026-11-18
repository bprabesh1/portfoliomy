'use strict';
// Usage: node scripts/reset-admin.js <username> [new-password]
// Emergency password reset from the server console (works even if the security question was never set).
const { db } = require('../lib/db');
const sec = require('../lib/security');
const crypto = require('node:crypto');
const [username, given] = process.argv.slice(2);
if (!username) { console.error('Usage: node scripts/reset-admin.js <username> [new-password]'); process.exit(1); }
const a = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
if (!a) { console.error('No such admin. Existing admins:', db.prepare('SELECT username FROM admins').all().map((r) => r.username).join(', ') || '(none)'); process.exit(1); }
const pw = given || crypto.randomBytes(9).toString('base64url') + crypto.randomInt(10, 99);
const problem = sec.passwordProblem(pw); if (problem) { console.error(problem); process.exit(1); }
db.prepare('UPDATE admins SET password_hash=?, must_change=?, failed_attempts=0, locked_until=0 WHERE id=?').run(sec.hashSecret(pw), given ? 0 : 1, a.id);
db.prepare('DELETE FROM sessions WHERE admin_id=?').run(a.id);
console.log(`Password for "${username}" reset to: ${pw}${given ? '' : '  (you will be asked to change it at login)'}`);
