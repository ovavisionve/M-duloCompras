/**
 * Migration: Update withholding rules to use official SENIAT codes
 * Replaces invented concept codes with the official 86-code catalog
 * from Manual Técnico SENIAT N° 60.40.40.039, Versión 2.3
 * Source: Decreto 1808, Art. 9 (G.O. 36.203 del 12/05/1997)
 */
exports.up = async function (knex) {
  // Remove all existing ISLR withholding rules (keep IVA as-is)
  await knex('withholding_rules').where({ type: 'ISLR' }).del();

  // Insert ISLR rules with official SENIAT concept codes
  await knex('withholding_rules').insert([
    // ── ISLR - Persona Natural Residente (PNR) ──
    // Sustraendo 83.3334 UT (Parágrafo 8°, Art. 9, Decreto 1808)
    { type: 'ISLR', concept_code: '002', concept_name: 'Honorarios profesionales no mercantiles (PNR)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: '012', concept_name: 'Honorarios profesionales pagados por clínicas, hospitales y similares (PNR)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: '018', concept_name: 'Comisiones distintas a remuneraciones salariales (PNR)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: '025', concept_name: 'Intereses pagados por PJ o comunidades (PNR)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: '053', concept_name: 'Contratistas y subcontratistas - ejecución de obras o servicios (PNR)', rate: 1.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: '057', concept_name: 'Arrendamiento de bienes inmuebles (PNR)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: '061', concept_name: 'Arrendamiento de bienes muebles (PNR)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: '071', concept_name: 'Fletes nacionales (PNR)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: '083', concept_name: 'Publicidad y propaganda (PNR)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },

    // ── ISLR - Persona Jurídica Domiciliada (PJD) ──
    // Sin sustraendo, pago mínimo sujeto: 25 UT (excepto numerales 9, 11, 14, 20)
    { type: 'ISLR', concept_code: '004', concept_name: 'Honorarios profesionales no mercantiles (PJD)', rate: 5.00, subtract_ut: 0, applies_to: 'juridica' },
    { type: 'ISLR', concept_code: '020', concept_name: 'Comisiones distintas a remuneraciones salariales (PJD)', rate: 5.00, subtract_ut: 0, applies_to: 'juridica' },
    { type: 'ISLR', concept_code: '027', concept_name: 'Intereses pagados por PJ o comunidades (PJD)', rate: 5.00, subtract_ut: 0, applies_to: 'juridica' },
    { type: 'ISLR', concept_code: '055', concept_name: 'Contratistas y subcontratistas - ejecución de obras o servicios (PJD)', rate: 2.00, subtract_ut: 0, applies_to: 'juridica' },
    { type: 'ISLR', concept_code: '059', concept_name: 'Arrendamiento de bienes inmuebles (PJD)', rate: 5.00, subtract_ut: 0, applies_to: 'juridica' },
    { type: 'ISLR', concept_code: '063', concept_name: 'Arrendamiento de bienes muebles (PJD)', rate: 5.00, subtract_ut: 0, applies_to: 'juridica' },
    { type: 'ISLR', concept_code: '072', concept_name: 'Fletes nacionales (PJD)', rate: 1.00, subtract_ut: 0, applies_to: 'juridica' },
    { type: 'ISLR', concept_code: '084', concept_name: 'Publicidad y propaganda (PJD)', rate: 5.00, subtract_ut: 0, applies_to: 'juridica' },
  ]);

  // Update IVA rules to ensure consistent naming
  await knex('withholding_rules')
    .where({ type: 'IVA', concept_code: 'IVA-75' })
    .update({ concept_name: 'Retención IVA 75% (contribuyente ordinario)' });
  await knex('withholding_rules')
    .where({ type: 'IVA', concept_code: 'IVA-100' })
    .update({ concept_name: 'Retención IVA 100% (sin RIF / factura incumple requisitos)' });
};

exports.down = async function (knex) {
  // Revert to generic codes
  await knex('withholding_rules').where({ type: 'ISLR' }).del();
  await knex('withholding_rules').insert([
    { type: 'ISLR', concept_code: 'ISLR-SP-PN', concept_name: 'Servicios profesionales (PN residente)', rate: 3.00, subtract_ut: 83.3334, applies_to: 'natural' },
    { type: 'ISLR', concept_code: 'ISLR-SP-PJ', concept_name: 'Servicios profesionales (PJ domiciliada)', rate: 5.00, subtract_ut: 0, applies_to: 'juridica' },
    { type: 'ISLR', concept_code: 'ISLR-ALQ', concept_name: 'Alquiler inmuebles', rate: 5.00, subtract_ut: 0, applies_to: 'ambos' },
    { type: 'ISLR', concept_code: 'ISLR-COM', concept_name: 'Comisiones mercantiles', rate: 5.00, subtract_ut: 0, applies_to: 'ambos' },
    { type: 'ISLR', concept_code: 'ISLR-PUB', concept_name: 'Publicidad y propaganda', rate: 5.00, subtract_ut: 0, applies_to: 'ambos' },
    { type: 'ISLR', concept_code: 'ISLR-TRA', concept_name: 'Transporte y fletes', rate: 1.00, subtract_ut: 0, applies_to: 'ambos' },
  ]);
};
