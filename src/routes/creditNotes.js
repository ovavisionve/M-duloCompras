const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const creditNoteService = require('../services/creditNoteService');

/**
 * @swagger
 * /credit-notes/pending:
 *   get:
 *     summary: Listar notas de crédito pendientes de aplicar
 *     tags: [Notas de Crédito]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: supplier_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de notas de crédito con saldo disponible
 */
router.get('/pending', authenticate, async (req, res, next) => {
  try {
    const data = await creditNoteService.listPendingCreditNotes(req.query, req.user.organizationId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /credit-notes/{id}/balance:
 *   get:
 *     summary: Obtener saldo de una nota de crédito
 *     tags: [Notas de Crédito]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Saldo de la nota de crédito
 */
router.get('/:id/balance', authenticate, async (req, res, next) => {
  try {
    const balance = await creditNoteService.getCreditNoteBalance(req.params.id, req.user.organizationId);
    res.json({ success: true, data: balance });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /credit-notes/{id}/applications:
 *   get:
 *     summary: Listar aplicaciones de una nota de crédito
 *     tags: [Notas de Crédito]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Lista de aplicaciones
 */
router.get('/:id/applications', authenticate, async (req, res, next) => {
  try {
    const data = await creditNoteService.getApplicationsByCreditNote(req.params.id, req.user.organizationId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /credit-notes/{id}/apply:
 *   post:
 *     summary: Aplicar nota de crédito a facturas
 *     tags: [Notas de Crédito]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - applications
 *             properties:
 *               applications:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - invoice_id
 *                     - amount_applied
 *                   properties:
 *                     invoice_id:
 *                       type: string
 *                       format: uuid
 *                     amount_applied:
 *                       type: number
 *                     applied_date:
 *                       type: string
 *                       format: date
 *                     notes:
 *                       type: string
 *     responses:
 *       201:
 *         description: Nota de crédito aplicada exitosamente
 */
router.post('/:id/apply', authenticate, authorize('admin', 'contador', 'operador'), async (req, res, next) => {
  try {
    const { applications } = req.body;
    if (!applications?.length) {
      return res.status(400).json({ success: false, error: { message: 'Debe especificar al menos una factura' } });
    }
    const result = await creditNoteService.applyCreditNote(
      req.params.id, applications, req.user.id, req.ip, req.user.organizationId
    );
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /credit-notes/applications/{applicationId}:
 *   delete:
 *     summary: Eliminar una aplicación de nota de crédito
 *     tags: [Notas de Crédito]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Aplicación eliminada
 */
router.delete('/applications/:applicationId', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const result = await creditNoteService.removeApplication(
      req.params.applicationId, req.user.id, req.ip, req.user.organizationId
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
