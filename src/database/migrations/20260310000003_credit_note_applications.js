/**
 * Migration: Credit Note Applications
 * - Adds note_reason and affected_invoice_number to invoices
 * - Creates credit_note_applications table for many-to-many NC-to-invoice allocation
 */
exports.up = async function (knex) {
  // Add new columns to invoices table
  await knex.schema.alterTable('invoices', (table) => {
    table.string('note_reason', 100).nullable();
    table.string('affected_invoice_number', 50).nullable();
  });

  // Create credit_note_applications table
  await knex.schema.createTable('credit_note_applications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('credit_note_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
    table.uuid('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
    table.decimal('amount_applied', 18, 2).notNullable();
    table.date('applied_date').notNullable();
    table.uuid('applied_by').nullable().references('id').inTable('users');
    table.text('notes').nullable();
    table.uuid('organization_id').nullable().references('id').inTable('organizations');
    table.timestamps(true, true);

    table.index('credit_note_id');
    table.index('invoice_id');
    table.index('organization_id');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('credit_note_applications');
  await knex.schema.alterTable('invoices', (table) => {
    table.dropColumn('note_reason');
    table.dropColumn('affected_invoice_number');
  });
};
