// Read-only inspection of Supabase database using already-installed pg dependency.
// Never logs or exposes the DATABASE_URL string anywhere in this file or output.
import { Pool } from 'pg';

const pool = new Pool(); // reads DATABASE_URL from process.env only

const queries = [
  { sql: 'SELECT current_database(), current_user;' },
  { sql: "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;" },
];

for (const { sql } of queries) {
  try {
    const res = await pool.query(sql);
    console.log(`✓ QUERY OK (${res.rowCount} rows)`);
    console.log('  OUTPUT:', JSON.stringify(res.rows));
  } catch (e) {
    console.error(`✗ QUERY FAILED: ${e.message}`);
  }
}

await pool.end();
