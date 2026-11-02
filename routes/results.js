const router = require('express').Router();
const Result = require('../models/Result');
const Application = require('../models/Application');
const Student = require('../models/Student');
const { protect, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const notify = require('../utils/notify');

router.use(protect);

const populateJob = { path: 'job', select: 'title package company', populate: { path: 'company', select: 'name' } };

// Only admins can declare final results
router.post('/', authorize('admin'), asyncHandler(async (req, res) => {
  const { applicationId, status, remarks } = req.body;
  if (!['Selected', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Result must be Selected or Rejected' });
  }
  const app = await Application.findById(applicationId).populate('student').populate({ path: 'job', populate: 'company' });
  if (!app) return res.status(404).json({ message: 'Application not found' });
  if (app.status === 'Withdrawn') return res.status(400).json({ message: 'Application was withdrawn' });
  if (status === 'Selected' && !['Shortlisted', 'Interview Scheduled', 'Selected'].includes(app.status)) {
    return res.status(400).json({ message: 'Only shortlisted / interviewed candidates can be selected' });
  }

  const pkg = req.body.package !== undefined && req.body.package !== '' ? Number(req.body.package) : app.job.package;
  const result = await Result.findOneAndUpdate(
    { application: app._id },
    { application: app._id, student: app.student._id, job: app.job._id, status, package: status === 'Selected' ? pkg : undefined, remarks, declaredBy: req.user._id },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );

  app.status = status;
  await app.save();

  if (status === 'Selected') {
    await Student.findByIdAndUpdate(app.student._id, {
      placementStatus: 'Placed', placedCompany: app.job.company.name, placedPackage: pkg,
    });
  }
  notify(
    app.student.user,
    status === 'Selected' ? 'Congratulations! You are selected' : 'Application result',
    status === 'Selected'
      ? `You have been selected by ${app.job.company.name} for ${app.job.title}.`
      : `Thank you for applying to ${app.job.company.name}. You were not selected this time.`
  );
  res.status(201).json(result);
}));

router.get('/', authorize('admin'), asyncHandler(async (req, res) => {
  const results = await Result.find()
    .populate('student', 'name rollNo department')
    .populate(populateJob)
    .sort({ createdAt: -1 });
  res.json(results);
}));

router.get('/my', authorize('student'), asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  res.json(await Result.find({ student: student._id }).populate(populateJob).sort({ createdAt: -1 }));
}));

module.exports = router;
