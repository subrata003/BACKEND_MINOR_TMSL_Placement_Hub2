const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Store uploaded Excel files in /uploads/excel (temp, deleted after processing)
const excelDir = path.join(__dirname, '..', 'uploads', 'excel');
fs.mkdirSync(excelDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, excelDir),
  filename: (req, file, cb) =>
    cb(null, `shortlist-${Date.now()}${path.extname(file.originalname)}`),
});

const allowedMimes = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv',
  'application/csv',
];

module.exports = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext) || allowedMimes.includes(file.mimetype)) {
      return cb(null, true);
    }
    const err = new Error('Only Excel (.xlsx, .xls) or CSV files are allowed');
    err.status = 400;
    cb(err);
  },
});
