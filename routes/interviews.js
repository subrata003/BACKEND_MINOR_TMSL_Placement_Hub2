const router = require('express').Router();
const Interview = require('../models/Interview');
const Application = require('../models/Application');
const Student = require('../models/Student');
const { protect, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const notify = require('../utils/notify');

router.use(protect);

const populateJob = { path: 'job', select: 'title company', populate: { path: 'company', select: 'name' } };

// Admin: schedule an interview round for a shortlisted candidate
router.post('/', authorize('admin'), asyncHandler(async (req, res) => {
  const { applicationId, roundNumber, roundName, date, time, mode, venue } = req.body;
  const app = await Application.findById(applicationId).populate('student', 'user').populate({ path: 'job', populate: 'company' });
  if (!app) return res.status(404).json({ message: 'Application not found' });
  if (!['Shortlisted', 'Interview Scheduled'].includes(app.status)) {
    return res.status(400).json({ message: 'Shortlist the candidate before scheduling an interview' });
  }
  const interview = await Interview.create({
    application: app._id, student: app.student._id, job: app.job._id,
    roundNumber, roundName, date, time, mode, venue,
  });
  app.status = 'Interview Scheduled';
  await app.save();
  notify(
    app.student.user,
    'Interview scheduled',
    `${roundName || 'Interview'} for ${app.job.title} at ${app.job.company.name} on ${new Date(date).toDateString()} at ${time}.`
  );
  res.status(201).json(interview);
}));

router.get('/', authorize('admin'), asyncHandler(async (req, res) => {
  const interviews = await Interview.find()
    .populate('student', 'name rollNo')
    .populate(populateJob)
    .sort({ date: 1 });
  res.json(interviews);
}));

router.get('/my', authorize('student'), asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  const interviews = await Interview.find({ student: student._id }).populate(populateJob).sort({ date: 1 });
  res.json(interviews);
}));

router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const iv = await Interview.findByIdAndDelete(req.params.id);
  if (!iv) return res.status(404).json({ message: 'Interview not found' });
  res.json({ message: 'Interview cancelled' });
}));

module.exports = router;
