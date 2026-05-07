exports.up = async (knex) => {
  await knex.schema.alterTable('users', (table) => {
    table.text('totp_secret').nullable();
    table.boolean('totp_enabled').notNullable().defaultTo(false);
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('totp_secret');
    table.dropColumn('totp_enabled');
  });
};
