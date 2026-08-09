// seed-auth.js
const fs = require('fs');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const serviceAccount = require('./serviceAccountKey.json');

// Point exclusively to Auth Emulator
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const app = initializeApp({ projectId: serviceAccount.project_id });
const auth = getAuth(app);

async function syncAuth() {
  console.log('🔑 Syncing Auth Users...');
  if (!fs.existsSync('./users.json')) {
    console.log('❌ users.json not found!');
    return;
  }

  const parsed = JSON.parse(fs.readFileSync('./users.json', 'utf8'));
  const users = parsed.users || [];

  const userImports = users.map(u => ({
    uid: u.localId,
    email: u.email,
    emailVerified: u.emailVerified || false,
    displayName: u.displayName,
    disabled: u.disabled || false,
    passwordHash: u.passwordHash ? Buffer.from(u.passwordHash, 'base64') : undefined,
    passwordSalt: u.passwordSalt ? Buffer.from(u.passwordSalt, 'base64') : undefined
  }));

  const hashOptions = {
    algorithm: 'SCRYPT',
    key: Buffer.from('3THj4/+tDB4KZ2s8j19NAmJV+ydi7GbVaZz6ZF/vcMmQFK7t9MBYyM4u5iozOk92v/HzYMTwo/KEjNPhg5R5zQ==', 'base64'),
    saltSeparator: Buffer.from('Bw==', 'base64'),
    rounds: 8,
    memoryCost: 14
  };

  const result = await auth.importUsers(userImports, { hash: hashOptions });
  console.log(`✅ Successfully imported ${result.successCount} Auth user(s)!`);
  process.exit(0);
}

syncAuth().catch(console.error);