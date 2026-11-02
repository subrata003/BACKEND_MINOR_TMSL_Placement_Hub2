const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads', 'resumes')),
  filename: (req, file, cb) => cb(null, `${req.user._id}-${Date.now()}.pdf`),
});

// PDF only, max 2 MB
module.exports = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    const err = new Error('Only PDF files are allowed');
    err.status = 400;
    cb(err);
  },
});
