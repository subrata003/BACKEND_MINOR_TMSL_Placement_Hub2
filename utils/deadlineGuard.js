/**
 * deadlineGuard middleware
 * Auto-marks expired jobs and blocks late applications.
 * Usage: router.use(deadlineGuard) or per-route.
 */
const Job = require('../models/Job');

/**
 * Call at startup and periodically to flip Open → Expired.
 * Also called on-demand before writes.
 */
exports.expireJobs = async () => {
  try {
    await Job.updateMany(
      { status: 'Open', deadline: { $lt: new Date() } },
      { $set: { status: 'Expired' } }
    );
  } catch (e) {
    console.error('expireJobs failed:', e.message);
  }
};
