const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

// Validate both MIME type and extension
const allowedTypes = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'text/csv': ['.csv'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};
const allowedExtensions = Object.values(allowedTypes).flat();

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeExts = allowedTypes[file.mimetype];
  if (mimeExts && mimeExts.includes(ext)) {
    cb(null, true);
  } else if (!mimeExts && allowedExtensions.includes(ext)) {
    // Extension valid but MIME mismatch — reject (possible spoofing)
    cb(new Error(`MIME type ${file.mimetype} no coincide con extensión ${ext}`), false);
  } else {
    cb(new Error(`Tipo de archivo no permitido: ${ext} (${file.mimetype})`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') },
});

module.exports = upload;
