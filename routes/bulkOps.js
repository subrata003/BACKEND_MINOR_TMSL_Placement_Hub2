/**
 * bulkOps.js — All bulk round-management operations
 *
 * GET  /api/bulk/stats/:jobId              Job + round stats
 * POST /api/bulk/assign-round1             Bulk-assign all applied → Round 1
 * POST /api/bulk/preview-shortlist         Parse Excel, preview (no DB write)
 * POST /api/bulk/confirm-shortlist         Advance matched → next round + auto-reject rest
 * POST /api/bulk/schedule-interviews       Bulk schedule interviews + notify
 * POST /api/bulk/preview-company-select    Parse company Excel, preview final selection
 * POST /api/bulk/confirm-company-select    Finalise selection + lock job
 * GET  /api/bulk/template/:type            Download Excel template
 */

const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const XLSX   = require('xlsx');

const Application = require('../models/Application');
const Student     = require('../models/Student');
const Job         = require('../models/Job');
const Interview   = require('../models/Interview');
const User        = require('../models/User');

const { protect, authorize }   = require('../middleware/auth');
const asyncHandler             = require('../utils/asyncHandler');
const uploadExcel              = require('../middleware/uploadExcel');
const notify                   = require('../utils/notify');
const {
  sendMail, sendMailBatch,
  interviewNotificationTemplate,
  roundRejectionTemplate,
  companySelectionTemplate,
} = require('../utils/mailer');

router.use(protect, authorize('admin'));

// ─── Helpers ──────────────────────────────────────────────────────
/** Parse first column of an Excel/CSV file; returns array of string values */
function parseRollNumbers(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows.length) return [];

  // Auto-detect roll-number column
  const header = rows[0].map((h) => String(h).toLowerCase().replace(/[\s_\-]/g, ''));
  const colIdx = (() => {
    const i = header.findIndex((h) => ['rollno','rollnumber','roll','enrollmentno','studentroll'].includes(h));
    return i >= 0 ? i : 0;
  })();

  return rows
    .map((r) => String(r[colIdx] ?? '').trim())
    .filter((v) => v && !/^[a-zA-Z]/.test(v)); // skip header text
}

function fmt12h(time) {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

const TERMINAL = ['Rejected', 'Withdrawn', 'Selected'];

// ─────────────────────────────────────────────────────────────────
// GET /api/bulk/stats/:jobId
// ─────────────────────────────────────────────────────────────────
router.get('/stats/:jobId', asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.jobId).populate('company', 'name');
  if (!job) return res.status(404).json({ message: 'Job not found' });

  const allApps = await Application.find({ job: req.params.jobId });

  const roundCounts = {};
  allApps.forEach((a) => { roundCounts[a.currentRound] = (roundCounts[a.currentRound] || 0) + 1; });

  const maxRound         = allApps.reduce((m, a) => Math.max(m, a.currentRound), 0);
  const assignedToRound1 = allApps.filter((a) => a.currentRound >= 1).length;
  const totalSelected    = allApps.filter((a) => a.status === 'Selected').length;
  const totalRejected    = allApps.filter((a) => a.status === 'Rejected').length;

  res.json({
    job: { _id: job._id, title: job.title, company: job.company, resultDeclared: job.resultDeclared },
    totalApplicants: allApps.length,
    assignedToRound1,
    maxRound,
    totalSelected,
    totalRejected,
    roundCounts,
  });
}));

// ─────────────────────────────────────────────────────────────────
// POST /api/bulk/assign-round1
// Body: { jobId }
// ─────────────────────────────────────────────────────────────────
router.post('/assign-round1', asyncHandler(async (req, res) => {
  const { jobId } = req.body;
  if (!jobId) return res.status(400).json({ message: 'jobId is required' });

  const job = await Job.findById(jobId).populate('company', 'name');
  if (!job)              return res.status(404).json({ message: 'Job not found' });
  if (job.resultDeclared) return res.status(400).json({ message: 'Results declared. Job is locked.' });

  const eligible = await Application.find({
    job: jobId, currentRound: 0, status: { $in: ['Applied', 'Under Review'] },
  }).populate('student', 'user name rollNumber');

  if (!eligible.length) {
    return res.json({ message: 'No eligible applications to assign.', updated: 0 });
  }

  const bulkOps = eligible.map((app) => ({
    updateOne: {
      filter: { _id: app._id },
      update: {
        $set: { currentRound: 1, status: 'Shortlisted' },
        $push: {
          history:      { status: 'Shortlisted', at: new Date() },
          roundHistory: { round: 1, assignedAt: new Date(), note: 'Bulk assigned to Round 1' },
        },
      },
    },
  }));
  const result = await Application.bulkWrite(bulkOps, { ordered: false });

  eligible.forEach((app) => {
    if (app.student?.user) notify(app.student.user, 'Assigned to Round 1',
      `You have been assigned to Round 1 for ${job.title} at ${job.company.name}.`);
  });

  res.json({ message: `${result.modifiedCount} student(s) assigned to Round 1.`, updated: result.modifiedCount });
}));

// ─────────────────────────────────────────────────────────────────
// POST /api/bulk/preview-shortlist
// Multipart: file + { jobId, currentRound }
// ─────────────────────────────────────────────────────────────────
router.post('/preview-shortlist', uploadExcel.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Please upload a file' });

  const { jobId, currentRound } = req.body;
  const cleanup = () => { try { fs.unlinkSync(req.file.path); } catch (_) {} };

  if (!jobId || currentRound === undefined) { cleanup(); return res.status(400).json({ message: 'jobId and currentRound are required' }); }

  const round = parseInt(currentRound, 10);
  if (isNaN(round) || round < 1) { cleanup(); return res.status(400).json({ message: 'currentRound must be ≥ 1' }); }

  const job = await Job.findById(jobId).populate('company', 'name');
  if (!job)               { cleanup(); return res.status(404).json({ message: 'Job not found' }); }
  if (job.resultDeclared) { cleanup(); return res.status(400).json({ message: 'Results declared. Job is locked.' }); }

  let rawRolls;
  try { rawRolls = parseRollNumbers(req.file.path); }
  catch (e) { cleanup(); return res.status(400).json({ message: `Parse error: ${e.message}` }); }
  finally   { cleanup(); }

  // Dedup
  const seen = new Set(); const duplicates = []; const unique = [];
  rawRolls.forEach((r) => { if (seen.has(r)) duplicates.push(r); else { seen.add(r); unique.push(r); } });

  const students    = await Student.find({ rollNumber: { $in: unique } }).select('_id name rollNumber user');
  const foundSet    = new Set(students.map((s) => s.rollNumber));
  const notFound    = unique.filter((r) => !foundSet.has(r));
  const studentIds  = students.map((s) => s._id);
  const applications = await Application.find({ job: jobId, student: { $in: studentIds } })
    .populate('student', 'name rollNumber');

  const appBySid = {};
  applications.forEach((a) => { appBySid[String(a.student._id)] = a; });

  const didNotApply    = students.filter((s) => !appBySid[String(s._id)]).map((s) => ({ rollNumber: s.rollNumber, name: s.name }));
  const eligibleApps   = [];
  const wrongRound     = [];
  const alreadyProcessed = [];

  applications.forEach((app) => {
    const rn = app.student.rollNumber;
    if (app.currentRound === round) {
      eligibleApps.push({ applicationId: app._id, studentId: app.student._id, rollNumber: rn, name: app.student.name, currentRound: app.currentRound, status: app.status });
    } else if (app.currentRound > round) {
      alreadyProcessed.push({ rollNumber: rn, name: app.student.name, currentRound: app.currentRound });
    } else {
      wrongRound.push({ rollNumber: rn, name: app.student.name, currentRound: app.currentRound });
    }
  });

  // Students who were in this round but NOT in the Excel → will be auto-rejected
  const eligibleStudentIds = new Set(eligibleApps.map((e) => String(e.studentId)));
  const willBeRejected = applications
    .filter((a) => a.currentRound === round && !TERMINAL.includes(a.status) && !eligibleStudentIds.has(String(a.student._id)))
    .map((a) => ({ rollNumber: a.student.rollNumber, name: a.student.name, applicationId: a._id }));

  res.json({
    summary: {
      totalInFile: rawRolls.length, uniqueInFile: unique.length, duplicates: duplicates.length,
      matched: students.length, notFound: notFound.length, didNotApply: didNotApply.length,
      wrongRound: wrongRound.length, alreadyProcessed: alreadyProcessed.length,
      eligibleToAdvance: eligibleApps.length, willBeRejected: willBeRejected.length,
    },
    details: { duplicates, notFound, didNotApply, wrongRound, alreadyProcessed, eligible: eligibleApps, willBeRejected },
    meta: { jobId, jobTitle: job.title, company: job.company?.name, currentRound: round, nextRound: round + 1 },
  });
}));

// ─────────────────────────────────────────────────────────────────
// POST /api/bulk/confirm-shortlist
// Body: { jobId, currentRound, applicationIds, autoRejectOthers? }
// ─────────────────────────────────────────────────────────────────
router.post('/confirm-shortlist', asyncHandler(async (req, res) => {
  const { jobId, currentRound, applicationIds, autoRejectOthers = true } = req.body;
  if (!jobId || currentRound === undefined || !Array.isArray(applicationIds) || !applicationIds.length) {
    return res.status(400).json({ message: 'jobId, currentRound and applicationIds[] are required' });
  }
  const round = parseInt(currentRound, 10);
  const job   = await Job.findById(jobId).populate('company', 'name');
  if (!job)              return res.status(404).json({ message: 'Job not found' });
  if (job.resultDeclared) return res.status(400).json({ message: 'Results declared. Job is locked.' });

  const nextRound = round + 1;
  const advancedSet = new Set(applicationIds.map(String));

  // Advance matched apps
  const toAdvance = await Application.find({
    _id: { $in: applicationIds }, job: jobId, currentRound: round, status: { $nin: TERMINAL },
  }).populate('student', 'user name rollNumber');

  if (!toAdvance.length) return res.status(400).json({ message: 'No valid applications to advance.' });

  const advanceOps = toAdvance.map((app) => ({
    updateOne: {
      filter: { _id: app._id },
      update: {
        $set: { currentRound: nextRound, status: 'Shortlisted' },
        $push: {
          history:      { status: 'Shortlisted', at: new Date() },
          roundHistory: { round: nextRound, assignedAt: new Date(), note: `Advanced R${round}→R${nextRound} via Excel` },
        },
      },
    },
  }));
  await Application.bulkWrite(advanceOps, { ordered: false });

  // Auto-reject remaining Round-N students not in the uploaded list
  let rejectedCount = 0;
  if (autoRejectOthers) {
    const toReject = await Application.find({
      job: jobId, currentRound: round, status: { $nin: TERMINAL },
      _id: { $nin: applicationIds },
    }).populate('student', 'user name rollNumber');

    if (toReject.length) {
      const rejectOps = toReject.map((app) => ({
        updateOne: {
          filter: { _id: app._id },
          update: {
            $set: { status: 'Rejected', rejectionReason: `Not shortlisted after Round ${round}`, rejectionEmailSent: false },
            $push: { history: { status: 'Rejected', at: new Date() } },
          },
        },
      }));
      await Application.bulkWrite(rejectOps, { ordered: false });
      rejectedCount = toReject.length;

      // Send rejection emails in batch
      const portalUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const rejectMsgs = [];
      for (const app of toReject) {
        const userDoc = await User.findById(app.student?.user).select('email');
        if (userDoc?.email) {
          rejectMsgs.push({
            to:      userDoc.email,
            subject: `[Placement Cell] Result — ${job.title} at ${job.company.name}`,
            text:    `Dear ${app.student.name}, you have not been shortlisted for Round ${nextRound} of ${job.title}.`,
            html:    roundRejectionTemplate({ studentName: app.student.name, companyName: job.company.name, jobTitle: job.title, roundNumber: round, portalUrl }),
          });
        }
        notify(app.student?.user, `Not shortlisted for Round ${nextRound}`,
          `You were not shortlisted for Round ${nextRound} of ${job.title} at ${job.company.name}.`);
      }
      await sendMailBatch(rejectMsgs);
      // Mark emails sent
      await Application.updateMany({ _id: { $in: toReject.map((a) => a._id) } }, { rejectionEmailSent: true });
    }
  }

  // Notify advanced students
  toAdvance.forEach((app) => {
    if (app.student?.user) notify(app.student.user, `Shortlisted for Round ${nextRound}`,
      `Congratulations! You are shortlisted for Round ${nextRound} of ${job.title} at ${job.company.name}.`);
  });

  res.json({
    message: `${toAdvance.length} student(s) advanced to Round ${nextRound}. ${rejectedCount} rejected.`,
    advanced: toAdvance.length, rejected: rejectedCount, nextRound,
    advancedApplicationIds: toAdvance.map((a) => String(a._id)),
  });
}));

// ─────────────────────────────────────────────────────────────────
// POST /api/bulk/schedule-interviews
// Body: { jobId, roundNumber, roundName, date, time, mode,
//         meetingLink?, venue?, additionalInstructions?, applicationIds[] }
// ─────────────────────────────────────────────────────────────────
router.post('/schedule-interviews', asyncHandler(async (req, res) => {
  const { jobId, roundNumber, roundName, date, time, mode, meetingLink, venue, additionalInstructions, applicationIds } = req.body;

  if (!jobId || !roundNumber || !roundName || !date || !time || !mode) {
    return res.status(400).json({ message: 'jobId, roundNumber, roundName, date, time and mode are required' });
  }
  if (!Array.isArray(applicationIds) || !applicationIds.length) {
    return res.status(400).json({ message: 'applicationIds[] must be non-empty' });
  }
  if (mode === 'Online'  && !meetingLink) return res.status(400).json({ message: 'Meeting link required for Online mode' });
  if (mode === 'Offline' && !venue)       return res.status(400).json({ message: 'Venue required for Offline mode' });

  const job = await Job.findById(jobId).populate('company', 'name');
  if (!job)              return res.status(404).json({ message: 'Job not found' });
  if (job.resultDeclared) return res.status(400).json({ message: 'Results declared. Job is locked.' });

  const apps = await Application.find({ _id: { $in: applicationIds }, job: jobId })
    .populate({ path: 'student', select: 'user name rollNumber' });

  if (!apps.length) return res.status(400).json({ message: 'No matching applications found' });

  const displayDate = new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const displayTime = fmt12h(time);
  const venueField  = mode === 'Online' ? meetingLink : venue;

  // Insert Interview docs (skip duplicates)
  const ivDocs = apps.map((app) => ({
    application: app._id, student: app.student._id, job: job._id,
    roundNumber: Number(roundNumber), roundName, date: new Date(date),
    time, mode, venue: venueField, additionalInstructions,
  }));
  try { await Interview.insertMany(ivDocs, { ordered: false }); }
  catch (e) { /* E11000 partial insert ok */ }

  // Update application status
  await Application.bulkWrite(apps.map((app) => ({
    updateOne: {
      filter: { _id: app._id },
      update: { $set: { status: 'Interview Scheduled' }, $push: { history: { status: 'Interview Scheduled', at: new Date() } } },
    },
  })), { ordered: false });

  // Send interview notification emails in batch
  const portalUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const mailMsgs  = [];
  for (const app of apps) {
    const userDoc = await User.findById(app.student?.user).select('email');
    const shortMsg = `Your interview for ${job.title} at ${job.company.name} is on ${displayDate} at ${displayTime} (${mode}).`;
    notify(app.student?.user, `Interview Scheduled — ${roundName}`, shortMsg);
    if (userDoc?.email) {
      mailMsgs.push({
        to:      userDoc.email,
        subject: `[Placement Cell] Interview Scheduled — ${job.title}`,
        text:    shortMsg,
        html:    interviewNotificationTemplate({
          studentName: app.student.name || 'Student', companyName: job.company.name,
          jobTitle: job.title, roundName, roundNumber: Number(roundNumber),
          date: displayDate, time: displayTime, mode,
          meetingLink: meetingLink || '', venue: venue || '',
          additionalInstructions, portalUrl,
        }),
      });
    }
  }
  const emailResults = await sendMailBatch(mailMsgs);
  const emailsFailed = emailResults.filter((r) => !r.success).length;

  res.status(201).json({
    message: `Interview scheduled for ${apps.length} student(s). Emails: ${apps.length - emailsFailed} sent, ${emailsFailed} failed.`,
    scheduled: apps.length, roundName, date: displayDate, time: displayTime, mode,
  });
}));

// ─────────────────────────────────────────────────────────────────
// POST /api/bulk/preview-company-select
// Multipart: file + { jobId, instructions? }
// ─────────────────────────────────────────────────────────────────
router.post('/preview-company-select', uploadExcel.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Please upload a file' });
  const { jobId } = req.body;
  const cleanup = () => { try { fs.unlinkSync(req.file.path); } catch (_) {} };

  if (!jobId) { cleanup(); return res.status(400).json({ message: 'jobId is required' }); }

  const job = await Job.findById(jobId).populate('company', 'name');
  if (!job) { cleanup(); return res.status(404).json({ message: 'Job not found' }); }
  if (job.resultDeclared) { cleanup(); return res.status(400).json({ message: 'Results already declared for this job.' }); }

  let rawRolls;
  try { rawRolls = parseRollNumbers(req.file.path); }
  catch (e) { cleanup(); return res.status(400).json({ message: `Parse error: ${e.message}` }); }
  finally   { cleanup(); }

  const seen = new Set(); const duplicates = []; const unique = [];
  rawRolls.forEach((r) => { if (seen.has(r)) duplicates.push(r); else { seen.add(r); unique.push(r); } });

  const students   = await Student.find({ rollNumber: { $in: unique } }).select('_id name rollNumber');
  const foundSet   = new Set(students.map((s) => s.rollNumber));
  const notFound   = unique.filter((r) => !foundSet.has(r));
  const studentIds = students.map((s) => s._id);

  const applications = await Application.find({ job: jobId, student: { $in: studentIds } })
    .populate('student', 'name rollNumber');

  const appBySid = {};
  applications.forEach((a) => { appBySid[String(a.student._id)] = a; });

  const didNotApply    = students.filter((s) => !appBySid[String(s._id)]).map((s) => ({ rollNumber: s.rollNumber, name: s.name }));
  const alreadySelected = applications.filter((a) => a.status === 'Selected').map((a) => ({ rollNumber: a.student.rollNumber, name: a.student.name }));
  const eligibleToSelect = applications.filter((a) => a.status !== 'Selected' && a.status !== 'Withdrawn' && a.status !== 'Rejected')
    .map((a) => ({ applicationId: a._id, studentId: a.student._id, rollNumber: a.student.rollNumber, name: a.student.name }));

  res.json({
    summary: {
      totalInFile: rawRolls.length, uniqueInFile: unique.length, duplicates: duplicates.length,
      matched: students.length, notFound: notFound.length, didNotApply: didNotApply.length,
      alreadySelected: alreadySelected.length, eligibleToSelect: eligibleToSelect.length,
    },
    details: { duplicates, notFound, didNotApply, alreadySelected, eligible: eligibleToSelect },
    meta: { jobId, jobTitle: job.title, company: job.company?.name },
  });
}));

// ─────────────────────────────────────────────────────────────────
// POST /api/bulk/confirm-company-select
// Body: { jobId, applicationIds[], instructions? }
// ─────────────────────────────────────────────────────────────────
router.post('/confirm-company-select', asyncHandler(async (req, res) => {
  const { jobId, applicationIds, instructions } = req.body;
  if (!jobId || !Array.isArray(applicationIds) || !applicationIds.length) {
    return res.status(400).json({ message: 'jobId and applicationIds[] are required' });
  }

  const job = await Job.findById(jobId).populate('company', 'name');
  if (!job)              return res.status(404).json({ message: 'Job not found' });
  if (job.resultDeclared) return res.status(400).json({ message: 'Results already declared for this job.' });

  const apps = await Application.find({
    _id: { $in: applicationIds }, job: jobId, status: { $nin: ['Selected', 'Withdrawn', 'Rejected'] },
  }).populate({ path: 'student', select: 'user name rollNumber' });

  if (!apps.length) return res.status(400).json({ message: 'No valid applications to confirm.' });

  // Mark selected
  await Application.bulkWrite(apps.map((app) => ({
    updateOne: {
      filter: { _id: app._id },
      update: { $set: { status: 'Selected' }, $push: { history: { status: 'Selected', at: new Date() } } },
    },
  })), { ordered: false });

  // Update student placement status
  await Student.bulkWrite(apps.map((app) => ({
    updateOne: {
      filter: { _id: app.student._id },
      update: { $set: { placementStatus: 'Placed', placedCompany: job.company.name } },
    },
  })), { ordered: false });

  // Lock the job
  await Job.findByIdAndUpdate(jobId, {
    resultDeclared: true, resultDeclaredAt: new Date(), status: 'Closed',
  });

  // Send selection emails in batch
  const portalUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const mailMsgs  = [];
  for (const app of apps) {
    const userDoc = await User.findById(app.student?.user).select('email');
    notify(app.student?.user, '🎉 Selected by Company!',
      `Congratulations! You have been selected by ${job.company.name} for ${job.title}.`);
    if (userDoc?.email) {
      mailMsgs.push({
        to:      userDoc.email,
        subject: `[Placement Cell] 🎉 You are Selected — ${job.title} at ${job.company.name}`,
        text:    `Congratulations ${app.student.name}! You have been selected by ${job.company.name} for ${job.title}.`,
        html:    companySelectionTemplate({
          studentName: app.student.name || 'Student', companyName: job.company.name,
          jobTitle: job.title, instructions, portalUrl,
        }),
      });
    }
  }
  const emailResults = await sendMailBatch(mailMsgs);

  res.json({
    message: `${apps.length} student(s) marked as Selected. Job locked. Emails sent.`,
    selected: apps.length,
    emailsSent: emailResults.filter((r) => r.success).length,
  });
}));

// ─────────────────────────────────────────────────────────────────
// GET /api/bulk/template/:type  — Download Excel template
// type: 'shortlist' or 'selection'
// ─────────────────────────────────────────────────────────────────
router.get('/template/:type', asyncHandler(async (req, res) => {
  const { type } = req.params;
  const label = type === 'selection' ? 'Company_Final_Selection' : 'Round_Shortlist';
  const wb    = XLSX.utils.book_new();
  const ws    = XLSX.utils.aoa_to_sheet([
    ['Roll Number']
  ]);
  ws['!cols'] = [{ wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Roll Numbers');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="${label}_Template.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
}));

module.exports = router;
