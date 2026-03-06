const { validationResult } = require('express-validator');

/**
 * Middleware that checks express-validator results and returns 400 if invalid.
 * Usage: router.post('/', [...validationRules], validate, handler)
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: errors.array().map((e) => e.msg).join('; '),
        details: errors.array(),
      },
    });
  }
  next();
}

module.exports = { validate };
