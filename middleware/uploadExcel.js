const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const excelDir = path.join(__dirname, '..', 'uploads', 'excel');
fs.mkdirSync(excelDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, excelDir),
  filename:    (req, file, cb) => cb(null, `upload-${Date.now()}${path.extname(file.originalname)}`),
});

const allowedMimes = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel', 'text/csv', 'application/csv',
];

module.exports = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext) || allowedMimes.includes(file.mimetype)) return cb(null, true);
    const err = new Error('Only Excel (.xlsx, .xls) or CSV files are allowed');
    err.status = 400;
    cb(err);
  },
});
