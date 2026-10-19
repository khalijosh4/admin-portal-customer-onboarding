const oracledb = require('oracledb');
require('dotenv').config();

(async () => {
  const conn = await oracledb.getConnection({
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE}`,
  });

  const tables = await conn.execute(
    `SELECT table_name FROM all_tables
     WHERE owner = 'DIGITALSOLUTIONS' AND table_name LIKE 'AP_%'
     ORDER BY table_name`,
  );
  console.log('AP_ tables in DIGITALSOLUTIONS:', tables.rows.map((r) => r[0]).join(', '));

  const adminCount = await conn.execute(`SELECT COUNT(*) FROM "DIGITALSOLUTIONS"."AP_ADMIN_USERS"`);
  console.log('AP_ADMIN_USERS rows:', adminCount.rows[0][0]);

  const notifCount = await conn.execute(`SELECT COUNT(*) FROM "DIGITALSOLUTIONS"."AP_NOTIFICATIONS"`);
  console.log('AP_NOTIFICATIONS rows:', notifCount.rows[0][0]);

  const hist = await conn.execute(`SELECT "name" FROM "migrations"`);
  console.log('migration history (UAT.migrations):', hist.rows.map((r) => r[0]).join(', '));

  const indexes = await conn.execute(
    `SELECT index_name FROM all_indexes
     WHERE owner = 'DIGITALSOLUTIONS' AND table_name LIKE 'AP_%'
     ORDER BY index_name`,
  );
  console.log('indexes:', indexes.rows.map((r) => r[0]).join(', '));

  const fks = await conn.execute(
    `SELECT constraint_name FROM all_constraints
     WHERE owner = 'DIGITALSOLUTIONS' AND table_name = 'AP_NEXT_OF_KIN' AND constraint_type = 'R'`,
  );
  console.log('FK on AP_NEXT_OF_KIN:', fks.rows.map((r) => r[0]).join(', '));

  await conn.close();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
