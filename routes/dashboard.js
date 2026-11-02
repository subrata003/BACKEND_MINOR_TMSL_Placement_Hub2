const router = require('express').Router();
const Student = require('../models/Student');
const Company = require('../models/Company');
const Job = require('../models/Job');
const Application = require('../models/Application');
const Interview = require('../models/Interview');
const Result = require('../models/Result');
const { protect, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { checkEligibility } = require('../utils/eligibility');

router.use(protect);

router.get('/admin', authorize('admin'), asyncHandler(async (req, res) => {
  const [students, companies, jobs, openJobs, applications, placed, interviews] = await Promise.all([
    Student.countDocuments(),
    Company.countDocuments(),
    Job.countDocuments(),
    Job.countDocuments({ status: 'Open', deadline: { $gte: new Date() } }),
    Application.countDocuments(),
    Student.countDocuments({ placementStatus: 'Placed' }),
    Interview.countDocuments({ date: { $gte: new Date() } }),
  ]);
  res.json({
    students, companies, jobs, openJobs, applications, placed, upcomingInterviews: interviews,
    placementRate: students ? Math.round((placed / students) * 100) : 0,
  });
}));

router.get('/reports', authorize('admin'), asyncHandler(async (req, res) => {
  const [byDepartment, byCompany, pkg, byStatus] = await Promise.all([
    Student.aggregate([
      { $group: { _id: { $ifNull: ['$department', 'Unspecified'] }, total: { $sum: 1 }, placed: { $sum: { $cond: [{ $eq: ['$placementStatus', 'Placed'] }, 1, 0] } } } },
      { $sort: { _id: 1 } },
    ]),
    Result.aggregate([
      { $match: { status: 'Selected' } },
      { $lookup: { from: 'jobs', localField: 'job', foreignField: '_id', as: 'job' } },
      { $unwind: '$job' },
      { $lookup: { from: 'companies', localField: 'job.company', foreignField: '_id', as: 'company' } },
      { $unwind: '$company' },
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


router.get('/student', authorize('student'), asyncHandler(async (req, res) => {
  // Find the logged-in student's profile
  const student = await Student.findOne({ user: req.user._id });

  // Check whether the profile exists
  if (!student) {
    return res.status(404).json({
      message: 'Student profile not found. Please complete your profile.',
    });
  }

  const [jobs, apps, interviews] = await Promise.all([
    Job.find({
      status: 'Open',
      deadline: { $gte: new Date() },
    }).lean(),

    Application.find({ student: student._id }).lean(),

    Interview.countDocuments({
      student: student._id,
      date: { $gte: new Date() },
    }),
  ]);

  const appliedIds = new Set(apps.map((a) => String(a.job)));

  const eligibleJobs = jobs.filter(
    (j) => checkEligibility(student, j).eligible
  );

  const byStatus = {};

  apps.forEach((a) => {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  });

  res.json({
    profileCompletion: student.profileCompletion,
    placementStatus: student.placementStatus,
    placedCompany: student.placedCompany,
    openJobs: jobs.length,
    eligibleJobs: eligibleJobs.length,
    notAppliedEligible: eligibleJobs.filter(
      (j) => !appliedIds.has(String(j._id))
    ).length,
    applications: apps.length,
    byStatus,
    upcomingInterviews: interviews,
  });
}));


module.exports = router;
