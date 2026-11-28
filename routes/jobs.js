
const router = require('express').Router();

const Job = require('../models/Job');
const Student = require('../models/Student');
const User = require('../models/User');
const Application = require('../models/Application');

const { protect, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { checkEligibility } = require('../utils/eligibility');

const notify = require('../utils/notify');
const { sendMail, jobAnnouncementTemplate } = require('../utils/mailer');
const { expireJobs } = require('../utils/deadlineGuard');


// ==========================================
// Notify eligible students about new drive
// ==========================================

async function notifyEligibleStudents(job) {
  try {
    if (job.status !== 'Open') return;

    const students = await Student.find()
      .select(
        'user name department degree cgpa percentage backlogs passingYear placementStatus'
      );

    const deadline = new Date(job.deadline).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const portalUrl =
      process.env.CLIENT_URL || 'http://localhost:5173';

    for (const student of students) {
      // Skip already placed students
      if (student.placementStatus === 'Placed') continue;

      // Check eligibility
      const { eligible } = checkEligibility(student, job);

      if (!eligible) continue;

      const title = 'New Placement Drive';

      const message =
        `${job.company.name} is hiring for ${job.title}. ` +
        `Apply before ${deadline}.`;

      // In-app notification
      await notify(student.user, title, message);

      // Fetch student email
      const userDoc = await User.findById(student.user)
        .select('email');

      if (userDoc?.email) {
        await sendMail({
          to: userDoc.email,

          subject:
            `[Placement Cell] New Drive: ${job.company.name} — ${job.title}`,

          text: message,

          html: jobAnnouncementTemplate({
            studentName: student.name || 'Student',
            companyName: job.company.name,
            jobTitle: job.title,
            jobType: job.jobType || 'Full-time',
            location: job.location || 'To be announced',
            packageLPA: job.package
              ? `${job.package} LPA`
              : 'As per company norms',
            deadline,
            portalUrl,
          }),
        });
      }
    }

    console.log(`Eligible student notifications processed for ${job.title}`);

  } catch (error) {
    console.error(
      'notifyEligibleStudents failed:',
      error.message
    );
  }
}


// ==========================================
// Authentication middleware
// ==========================================

router.use(protect);


// ==========================================
// GET /api/jobs
// Admin: All jobs with application counts
// Student: Open jobs with eligibility
// ==========================================

router.get('/', asyncHandler(async (req, res) => {

  await expireJobs();

  // Admin view
  if (req.user.role === 'admin') {

    const [jobs, counts] = await Promise.all([

      Job.find()
        .populate('company', 'name')
        .sort({ createdAt: -1 })
        .lean(),

      Application.aggregate([
        {
          $group: {
            _id: '$job',
            n: { $sum: 1 }
          }
        }
      ])

    ]);

    const map = Object.fromEntries(
      counts.map(c => [String(c._id), c.n])
    );

    return res.json(
      jobs.map(job => ({
        ...job,
        applicationCount: map[String(job._id)] || 0
      }))
    );
  }

  // Student view
  const student = await Student.findOne({
    user: req.user._id
  });

  if (!student) {
    return res.status(404).json({
      message: 'Student profile not found'
    });
  }

  const [jobs, apps] = await Promise.all([

    Job.find({
      status: { $in: ['Open', 'Expired'] }
    })
      .populate('company', 'name website industry')
      .sort({ deadline: 1 })
      .lean(),

    Application.find({
      student: student._id
    })
      .select('job status')
      .lean()

  ]);

  const applied = Object.fromEntries(
    apps.map(app => [String(app.job), app.status])
  );

  const now = new Date();

  const response = jobs.map(job => {

    const { eligible, reasons } =
      checkEligibility(student, job);

    const deadlinePassed =
      new Date(job.deadline) < now;

    return {
      ...job,
      eligible,
      reasons,
      applicationStatus: applied[String(job._id)] || null,
      deadlinePassed,
      isExpired: job.status === 'Expired' || deadlinePassed
    };

  });

  res.json(response);

}));


// ==========================================
// GET /api/jobs/:id
// ==========================================

router.get('/:id', asyncHandler(async (req, res) => {

  const job = await Job.findById(req.params.id)
    .populate('company');

  if (!job) {
    return res.status(404).json({
      message: 'Job not found'
    });
  }

  res.json(job);

}));


// ==========================================
// POST /api/jobs
// Create job + notify eligible students
// ==========================================

router.post(
  '/',
  authorize('admin'),
  asyncHandler(async (req, res) => {

    const job = await Job.create(req.body);

    const populated = await job.populate(
      'company',
      'name'
    );

    // Send notifications in background
    notifyEligibleStudents(populated);

    res.status(201).json(populated);

  })
);


// ==========================================
// PUT /api/jobs/:id
// Update job
// ==========================================

router.put(
  '/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {

    const existing = await Job.findById(req.params.id);

    if (!existing) {
      return res.status(404).json({
        message: 'Job not found'
      });
    }

    if (
      existing.resultDeclared &&
      req.body.status === 'Open'
    ) {
      return res.status(400).json({
        message: 'Final results have been declared. This job is locked.'
      });
    }

    const job = await Job.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    res.json(job);

  })
);


// ==========================================
// DELETE /api/jobs/:id
// Delete job if no applications exist
// ==========================================

router.delete(
  '/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {

    if (await Application.exists({
      job: req.params.id
    })) {
      return res.status(400).json({
        message: 'Job has applications — close it instead of deleting'
      });
    }

    const job = await Job.findByIdAndDelete(
      req.params.id
    );

    if (!job) {
      return res.status(404).json({
        message: 'Job not found'
      });
    }

    res.json({
      message: 'Job deleted'
    });

  })
);


module.exports = router;
