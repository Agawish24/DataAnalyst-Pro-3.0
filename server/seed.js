require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./src/db/pool');

async function seed() {
  try {
    const hash = await bcrypt.hash('demo123', 12);
    const hash2 = await bcrypt.hash('analyst123', 12);

    await pool.query(`INSERT INTO users (name, email, role, password_hash) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name`,
      ['Demo Admin', 'demo@dataanalyst.com', 'admin', hash]);
    await pool.query(`INSERT INTO users (name, email, role, password_hash) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name`,
      ['Jane Analyst', 'analyst@dataanalyst.com', 'analyst', hash2]);

    console.log('Seeded: demo@dataanalyst.com / demo123');
    console.log('Seeded: analyst@dataanalyst.com / analyst123');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  }
}

seed();
