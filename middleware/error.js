exports.notFound = (req, res) =>
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });

exports.errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  let status = err.status || (res.statusCode >= 400 ? res.statusCode : 500);
  let message = err.message || 'Server error';

  if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    message = 'Duplicate entry: ' + Object.keys(err.keyValue || {}).join(', ') + ' already exists';
  } else if (err.name === 'MulterError') {
    status = 400;
  }
  if (status === 500) console.error(err);
  res.status(status).json({ message });
};
