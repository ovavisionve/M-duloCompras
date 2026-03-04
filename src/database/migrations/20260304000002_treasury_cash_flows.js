/**
 * Migration: Treasury Cash Flows (Posición Cambiaria)
 * Tracks VES entries/exits in the internal "fictional" account.
 * Allows tracking USD equivalent at entry time vs current BCV rate.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('treasury_cash_flows', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.date('flow_date').notNullable();
    t.enum('flow_type', ['ingreso', 'egreso']).notNullable();
    t.decimal('amount_ves', 18, 2).notNullable();
    t.decimal('bcv_rate', 18, 6).notNullable(); // BCV rate at time of movement
    t.decimal('usd_equivalent', 18, 2).notNullable(); // amount_ves / bcv_rate at entry
    t.text('description').nullable();
    t.string('reference_type', 30).nullable(); // 'treasury_operation', 'manual'
    t.uuid('reference_id').nullable(); // links to treasury_operations.id
    t.enum('status', ['activo', 'anulado']).defaultTo('activo');
    t.uuid('created_by').references('id').inTable('users');
    t.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('treasury_cash_flows');
};
