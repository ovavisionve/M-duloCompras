const bcrypt = require('bcryptjs');

/**
 * Add `super_admin` role to users.role check constraint and seed the master
 * portal user. The super_admin operates the multi-tenant portal: it can list,
 * create and manage organizations and their users across the whole system.
 */
exports.up = async function (knex) {
  // Knex `enum()` on Postgres creates a CHECK constraint named "<table>_<col>_check".
  await knex.raw('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_check"');
  await knex.raw(`
    ALTER TABLE "users"
    ADD CONSTRAINT "users_role_check"
    CHECK (role IN ('admin', 'contador', 'tesorero', 'operador', 'auditor', 'api_consumer', 'super_admin'))
  `);

  // Seed master super_admin user (no organization — operates across all orgs)
  const email = 'master@compraria.com';
  const exists = await knex('users').where({ email }).first();
  if (!exists) {
    const passwordHash = await bcrypt.hash('Master2026!', 12);
    await knex('users').insert({
      email,
      password_hash: passwordHash,
      full_name: 'Portal Master',
      role: 'super_admin',
      organization_id: null,
      is_active: true,
    });
  }
};

exports.down = async function (knex) {
  await knex('users').where({ email: 'master@compraria.com', role: 'super_admin' }).del();

  await knex.raw('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_check"');
  await knex.raw(`
    ALTER TABLE "users"
    ADD CONSTRAINT "users_role_check"
    CHECK (role IN ('admin', 'contador', 'tesorero', 'operador', 'auditor', 'api_consumer'))
  `);
};
