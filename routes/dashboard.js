const router = require('express').Router();
const Student     = require('../models/Student');
const Company     = require('../models/Company');
const Job         = require('../models/Job');
const Application = require('../models/Application');
const Interview   = require('../models/Interview');
const Result      = require('../models/Result');
const { protect, authorize }   = require('../middleware/auth');
const asyncHandler             = require('../utils/asyncHandler');
const { checkEligibility }     = require('../utils/eligibility');

router.use(protect);

// ── Admin dashboard ──────────────────────────────────────────────
router.get('/admin', authorize('admin'), asyncHandler(async (req, res) => {
  const now = new Date();
  const [
    students, companies, jobs,
    activeJobs, expiredJobs, closedJobs,
    applications, placed, upcomingInterviews,
    totalSelected, totalRejected, resultsDeclared,
    round1Apps, round2Apps,
  ] = await Promise.all([
    Student.countDocuments(),
    Company.countDocuments(),
    Job.countDocuments(),
    Job.countDocuments({ status: 'Open', deadline: { $gte: now } }),
    Job.countDocuments({ status: 'Expired' }),
    Job.countDocuments({ status: 'Closed' }),
    Application.countDocuments(),
    Student.countDocuments({ placementStatus: 'Placed' }),
    Interview.countDocuments({ date: { $gte: now }, status: 'Scheduled' }),
    Application.countDocuments({ status: 'Selected' }),
    Application.countDocuments({ status: 'Rejected' }),
    Job.countDocuments({ resultDeclared: true }),
    Application.countDocuments({ currentRound: 1, status: { $ne: 'Rejected' } }),
    Application.countDocuments({ currentRound: { $gte: 2 }, status: { $ne: 'Rejected' } }),
  ]);

  res.json({
    students, companies, jobs,
    activeJobs, expiredJobs, closedJobs,
    applications, placed, upcomingInterviews,
    totalSelected, totalRejected, resultsDeclared,
    round1Shortlisted: round1Apps, round2Shortlisted: round2Apps,
    placementRate: students ? Math.round((placed / students) * 100) : 0,
  });
}));

// ── Admin reports ─────────────────────────────────────────────────
router.get('/reports', authorize('admin'), asyncHandler(async (req, res) => {
  const [byDepartment, byCompany, pkg, byStatus] = await Promise.all([
    Student.aggregate([
      { $group: { _id: { $ifNull: ['$department', 'Unspecified'] }, total: { $sum: 1 }, placed: { $sum: { $cond: [{ $eq: ['$placementStatus', 'Placed'] }, 1, 0] } } } },
      { $sort: { _id: 1 } },
    ]),
    Result.aggregate([
      { $match: { status: 'Selected' } },
      { $lookup: { from: 'jobs',      localField: 'job',         foreignField: '_id', as: 'job'     } }, { $unwind: '$job' },
      { $lookup: { from: 'companies', localField: 'job.company', foreignField: '_id', as: 'company' } }, { $unwind: '$company' },
      { $group: { _id: '$company.name', selected: { $sum: 1 }, avgPackage: { $avg: '$package' } } },
      { $sort: { selected: -1 } },
    ]),
    Result.aggregate([
      { $match: { status: 'Selected', package: { $ne: null } } },
      { $group: { _id: null, highest: { $max: '$package' }, average: { $avg: '$package' }, lowest: { $min: '$package' } } },
    ]),
    Application.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  res.json({ byDepartment, byCompany, packageStats: pkg[0] || { highest: 0, average: 0, lowest: 0 }, byStatus });
}));

// ── Student dashboard ─────────────────────────────────────────────
router.get('/student', authorize('student'), asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  if (!student) return res.status(404).json({ message: 'Profile not found.' });

  const now = new Date();
  const [jobs, apps, interviews] = await Promise.all([
    Job.find({ status: { $in: ['Open', 'Expired'] } }).lean(),
    Application.find({ student: student._id }).lean(),
    Interview.countDocuments({ student: student._id, date: { $gte: now }, status: 'Scheduled' }),
  ]);

  const appliedIds    = new Set(apps.map((a) => String(a.job)));
  const eligibleJobs  = jobs.filter((j) => checkEligibility(student, j).eligible && j.status === 'Open');
  const byStatus      = {};
  apps.forEach((a) => { byStatus[a.status] = (byStatus[a.status] || 0) + 1; });

  res.json({
    profileCompletion: student.profileCompletion,
    placementStatus:   student.placementStatus,
    placedCompany:     student.placedCompany,
    openJobs:          jobs.filter((j) => j.status === 'Open').length,
    eligibleJobs:      eligibleJobs.length,
    notAppliedEligible: eligibleJobs.filter((j) => !appliedIds.has(String(j._id))).length,
    applications:      apps.length,
    byStatus,
    upcomingInterviews: interviews,
  });
}));

module.exports = router;
