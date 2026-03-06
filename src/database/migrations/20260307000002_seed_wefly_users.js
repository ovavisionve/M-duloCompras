const bcrypt = require('bcryptjs');

/**
 * Seed WEFLY2022 C.A. team users with distinct credentials
 */
exports.up = async function (knex) {
  const users = [
    { email: 'gerencia@wefly.com.ve', full_name: 'Gerencia General WEFLY', role: 'admin', password: 'Gerencia2024!' },
    { email: 'contabilidad@wefly.com.ve', full_name: 'Contabilidad WEFLY', role: 'contador', password: 'Contab2024!' },
    { email: 'tesoreria@wefly.com.ve', full_name: 'Tesorería WEFLY', role: 'tesorero', password: 'Tesorer2024!' },
    { email: 'compras@wefly.com.ve', full_name: 'Compras WEFLY', role: 'operador', password: 'Compras2024!' },
    { email: 'asistente@wefly.com.ve', full_name: 'Asistente Administrativo WEFLY', role: 'operador', password: 'Asist2024!' },
  ];

  for (const u of users) {
    const exists = await knex('users').where({ email: u.email }).first();
    if (!exists) {
      const hash = await bcrypt.hash(u.password, 12);
      await knex('users').insert({
        email: u.email,
        password_hash: hash,
        full_name: u.full_name,
        role: u.role,
      });
    }
  }
};

exports.down = async function (knex) {
  await knex('users').whereIn('email', [
    'gerencia@wefly.com.ve',
    'contabilidad@wefly.com.ve',
    'tesoreria@wefly.com.ve',
    'compras@wefly.com.ve',
    'asistente@wefly.com.ve',
  ]).del();
};
