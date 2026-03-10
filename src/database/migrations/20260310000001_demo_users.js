const bcrypt = require('bcryptjs');

/**
 * Create demo users for prospect demonstrations
 * Alejandro Palmese & Luis Ilarraza — both admin role
 */
exports.up = async function (knex) {
  const users = [
    {
      email: 'alejandro@compraria.com',
      full_name: 'Alejandro Palmese',
      role: 'admin',
      password: 'Demo2024!',
    },
    {
      email: 'luis@compraria.com',
      full_name: 'Luis Ilarraza',
      role: 'admin',
      password: 'Demo2024!',
    },
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
    'alejandro@compraria.com',
    'luis@compraria.com',
  ]).del();
};
