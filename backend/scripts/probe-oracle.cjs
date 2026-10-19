// Phase-0 Oracle probe: connectivity, version, schema visibility, table
// inventory (conflict scan) and DDL rights in DIGITALSOLUTIONS.
// Reads backend/.env (shell env vars take precedence). Never prints secrets.
const fs = require('fs');
const path = require('path');
const oracledb = require('oracledb');

function readEnvFile() {
  const out = {};
  const p = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(p)) return out;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function step(label, fn) {
  try {
    const result = await fn();
    console.log(`\n=== ${label} ===`);
    console.log(result);
  } catch (err) {
    console.log(`\n=== ${label} ===`);
    console.log(`FAILED: ${err.message || err}`);
  }
}

async function main() {
  const file = readEnvFile();
  const pick = (k) => process.env[k] || file[k] || '';

  const host = pick('DB_HOST');
  const port = pick('DB_PORT') || '1521';
  const service = pick('DB_SERVICE');
  const user = pick('DB_USERNAME');
  const password = pick('DB_PASSWORD');
  const schema = pick('DB_SCHEMA') || 'DIGITALSOLUTIONS';

  if (!host || !service || !user || !password) {
    console.error('Missing DB_HOST / DB_SERVICE / DB_USERNAME / DB_PASSWORD in env or backend/.env');
    process.exit(2);
  }

  console.log(`Target: ${user}@${host}:${port}/${service}  schema=${schema}`);
  oracledb.connectionCallTimeout = 15;

  let conn;
  try {
    conn = await oracledb.getConnection({ user, password, connectString: `${host}:${port}/${service}` });
    console.log('CONNECTED OK (thin mode)');
  } catch (err) {
    console.error(`CONNECTION FAILED: ${err.message || err}`);
    process.exit(1);
  }

  const rows = async (sql) => {
    const res = await conn.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return res.rows || [];
  };
  const show = (objs, limit = 60) => {
    if (!objs.length) return '(no rows)';
    return objs.slice(0, limit).map((r) => JSON.stringify(r)).join('\n') +
      (objs.length > limit ? `\n... ${objs.length - limit} more` : '');
  };

  await step('Oracle version', async () => show(await rows(`SELECT banner FROM v$version`)));
  await step('Current user / schema', async () =>
    show(await rows(`SELECT USER AS current_user, SYS_CONTEXT('USERENV','CURRENT_SCHEMA') AS current_schema, USERENV('LANGUAGE') AS nls_language FROM dual`)));
  await step('Account status + default tablespace', async () =>
    show(await rows(`SELECT username, default_tablespace, temporary_tablespace, account_status FROM user_users`)));
  await step('Visible schemas (all_users)', async () =>
    show(await rows(`SELECT username FROM all_users ORDER BY username`), 200));
  await step(`Existing tables in ${schema} (conflict scan)`, async () =>
    show(await rows(`SELECT table_name FROM all_tables WHERE owner = '${schema}' ORDER BY table_name`), 200));
  await step('Planned names already taken?', async () =>
    show(await rows(
      `SELECT table_name FROM all_tables WHERE owner = '${schema}' AND table_name IN (` +
      `'AP_ADMIN_USERS','AP_APPLICATIONS','AP_NOTIFICATIONS','AP_NEXT_OF_KIN','AP_IMAGES',` +
      `'USERS','APPLICATIONS','NOTIFICATIONS','IMAGES','ADMIN_USERS','NEXT_OF_KIN') ORDER BY table_name`
    )));
  await step('uat system privileges (user_sys_privs)', async () =>
    show(await rows(`SELECT privilege, admin_option FROM user_sys_privs ORDER BY privilege`), 200));
  await step(`Direct grants on ${schema}.* (all_tab_privs)`, async () =>
    show(await rows(`SELECT table_name, privilege, grantable FROM all_tab_privs WHERE owner = '${schema}' AND grantee = USER ORDER BY table_name`), 100));
  await step('Roles', async () => show(await rows(`SELECT granted_role, default_role FROM user_role_privs`), 100));

  await step(`DDL probe: CREATE + DROP ${schema}.AP_PROBE`, async () => {
    try {
      await conn.execute(`CREATE TABLE ${schema}.AP_PROBE (ID NUMBER)`);
      await conn.execute(`DROP TABLE ${schema}.AP_PROBE`);
      return 'DDL OK — uat can create objects in ' + schema;
    } catch (err) {
      return `DDL FAILED (errorNum=${err.errorNum ?? 'n/a'}): ${err.message || err}`;
    }
  });

  await conn.close();
  console.log('\nProbe done.');
}

main().catch((err) => {
  console.error('Probe crashed:', err);
  process.exit(1);
});
