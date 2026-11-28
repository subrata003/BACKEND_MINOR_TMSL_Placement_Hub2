<<<<<<< Updated upstream
require("dotenv").config();
const express = require("express");
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
=======
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const morgan  = require('morgan');
>>>>>>> Stashed changes
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/error');
const { expireJobs } = require('./utils/deadlineGuard');

// Ensure upload dirs exist
fs.mkdirSync(path.join(__dirname, 'uploads', 'resumes'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'uploads', 'excel'),   { recursive: true });

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use(morgan('dev'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/students',      require('./routes/students'));
app.use('/api/companies',     require('./routes/companies'));
app.use('/api/jobs',          require('./routes/jobs'));
app.use('/api/applications',  require('./routes/applications'));
app.use('/api/interviews',    require('./routes/interviews'));
app.use('/api/results',       require('./routes/results'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/dashboard',     require('./routes/dashboard'));
app.use('/api/bulk',          require('./routes/bulkOps'));

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    // Run initial deadline expiry sweep
    await expireJobs();
    // Sweep every 10 minutes
    setInterval(expireJobs, 10 * 60 * 1000);

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  }
};

<<<<<<< Updated upstream

startServer();
=======
startServer();
>>>>>>> Stashed changes
