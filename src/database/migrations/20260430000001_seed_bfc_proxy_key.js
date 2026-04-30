exports.up = async function (knex) {
  const wefly = await knex('organizations').where({ slug: 'wefly' }).first();
  if (!wefly) return;

  const existing = await knex('bfc_config').where({ organization_id: wefly.id }).first();
  if (existing) {
    await knex('bfc_config').where({ id: existing.id }).update({
      proxy_api_key: 'bfc_proxy_k7x9mQ2pRvL4nW8jYt3dZs6uHcA1eF5i',
      is_active: true,
      updated_at: new Date(),
    });
  } else {
    await knex('bfc_config').insert({
      organization_id: wefly.id,
      proxy_api_key: 'bfc_proxy_k7x9mQ2pRvL4nW8jYt3dZs6uHcA1eF5i',
      is_active: true,
    });
  }
};

exports.down = async function (knex) {
  const wefly = await knex('organizations').where({ slug: 'wefly' }).first();
  if (wefly) {
    await knex('bfc_config').where({ organization_id: wefly.id }).del();
  }
};
