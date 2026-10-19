const oracledb = require('oracledb');
require('dotenv').config();

(async () => {
  const conn = await oracledb.getConnection({
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE}`,
  });
  const r = await conn.execute(
    `SELECT owner, index_name, table_name FROM all_indexes
     WHERE index_name LIKE 'UQ\\_AP%' ESCAPE '\\' OR index_name LIKE 'IDX\\_AP%' ESCAPE '\\'
     ORDER BY owner, index_name`,
  );
  console.log(JSON.stringify(r.rows, null, 1));
  await conn.close();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
