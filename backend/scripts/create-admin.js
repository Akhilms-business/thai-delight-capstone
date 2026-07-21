// Run once to create the first admin account:
//   node scripts/create-admin.js "Admin" "User" admin@thaidelight.com "StrongPassw0rd!"
require('dotenv').config();
const bcrypt = require('bcrypt');
const { query, pool } = require('../config/db');

async function main() {
  const [firstName, lastName, email, password] = process.argv.slice(2);
  if (!firstName || !lastName || !email || !password) {
    console.error('Usage: node create-admin.js <firstName> <lastName> <email> <password>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  try {
    const result = await query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,'admin')
       ON CONFLICT (email) DO UPDATE SET role = 'admin'
       RETURNING id, email, role`,
      [firstName, lastName, email, hash]
    );
    console.log('Admin created/updated:', result.rows[0]);
  } catch (err) {
    console.error('Failed:', err.message);
  } finally {
    await pool.end();
  }
}

main();
