const router = require('express').Router();
const fs      = require('fs');
const path    = require('path');
const Student = require('../models/Student');
const User    = require('../models/User');
const Application = require('../models/Application');
const Interview   = require('../models/Interview');
const Result      = require('../models/Result');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth');
const upload    = require('../middleware/upload');
const asyncHandler = require('../utils/asyncHandler');
<<<<<<< Updated upstream
const {
    uploadOnCloudinary,
    deleteFromeCloudinary
} = require("../service/cloudinary.service");
=======
const { isValidPhone, PHONE_ERROR } = require('../utils/phoneValidator');
>>>>>>> Stashed changes

router.use(protect);

const EDITABLE = ['name', 'rollNumber', 'phone', 'department', 'degree', 'passingYear', 'cgpa', 'percentage', 'tenthPercentage', 'twelfthPercentage', 'backlogs'];
const NUMERIC  = ['passingYear', 'cgpa', 'percentage', 'tenthPercentage', 'twelfthPercentage', 'backlogs'];

// ── Student: view own profile ────────────────────────────────────
router.get('/me', authorize('student'), asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user._id }).populate('user', 'email');
  if (!student) return res.status(404).json({ message: 'Profile not found' });
  res.json(student);
}));
<<<<<<< Updated upstream
// update profile
=======

// ── Student: update own profile ──────────────────────────────────
>>>>>>> Stashed changes
router.put('/me', authorize('student'), asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  if (!student) return res.status(404).json({ message: 'Profile not found' });

  // Phone validation
  if (req.body.phone !== undefined && req.body.phone !== '') {
    if (!isValidPhone(req.body.phone)) {
      return res.status(400).json({ message: PHONE_ERROR });
    }
  }

  for (const f of EDITABLE) {
    if (req.body[f] === undefined) continue;
    const v = req.body[f];
    student[f] = NUMERIC.includes(f) ? (v === '' || v === null ? undefined : Number(v)) : v;
  }
  await student.save();
  res.json(student);
}));

<<<<<<< Updated upstream
// upload and update resume both are happend

router.post(
    "/me/resume",
    authorize("student"),
    upload.single("resume"),
    asyncHandler(async (req, res) => {

        // Check uploaded file
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Please attach a PDF file"
            });
        }

        //  Find logged-in student's profile
        const student = await Student.findOne({
            user: req.user._id
        });

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student profile not found"
            });
        }

        //  Store OLD public ID before updating
        const oldPublicId = student.resume?.publicId;

        //  Upload NEW resume to Cloudinary
        const cloudinaryResult = await uploadOnCloudinary(
            req.file.path,
            "raw"
        );

        if (!cloudinaryResult) {
            return res.status(500).json({
                success: false,
                message: "Resume upload failed"
            });
        }

        console.log("NEW RESUME:", cloudinaryResult.public_id);
        console.log("OLD RESUME:", oldPublicId);

        //  Update student document
        student.resume = {
            url: cloudinaryResult.secure_url,
            publicId: cloudinaryResult.public_id
        };

        try {
            await student.save();

        } catch (error) {

            // Database save failed: delete NEW uploaded resume
            await deleteFromeCloudinary(
                cloudinaryResult.public_id,
                "raw"
            );

            throw error;
        }

        //  Delete OLD resume only after successful DB save
        if (
            oldPublicId &&
            oldPublicId !== cloudinaryResult.public_id
        ) {
            console.log("DELETING OLD RESUME:", oldPublicId);

            const deleteResult = await deleteFromeCloudinary(
                oldPublicId,
                "raw"
            );

            if (!deleteResult.success) {
                console.error("Old resume cleanup requires retry");
            }
        }

        //  Send response
        return res.status(200).json({
            success: true,
            message: "Resume uploaded successfully",
            resume: student.resume
        });
    })
);
// ---------- Admin: manage students ----------
// Search + filters: ?search=&department=&passingYear=&minCgpa=&placementStatus=&page=&limit=
=======
// ── Student: upload resume ────────────────────────────────────────
router.post('/me/resume', authorize('student'), upload.single('resume'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Please attach a PDF file' });
  const student = await Student.findOne({ user: req.user._id });
  if (student.resume) fs.unlink(path.join(__dirname, '..', student.resume), () => {});
  student.resume = `/uploads/resumes/${req.file.filename}`;
  await student.save();
  res.json(student);
}));

// ── Admin: list students ──────────────────────────────────────────
>>>>>>> Stashed changes
router.get('/', authorize('admin'), asyncHandler(async (req, res) => {
  const { search, department, passingYear, minCgpa, placementStatus } = req.query;
  const page  = Math.max(parseInt(req.query.page)  || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const q = {};
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    q.$or = [{ name: rx }, { rollNumber: rx }];
  }
  if (department)      q.department = new RegExp(`^${department.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  if (passingYear)     q.passingYear = Number(passingYear);
  if (minCgpa)         q.cgpa = { $gte: Number(minCgpa) };
  if (placementStatus) q.placementStatus = placementStatus;

  const [students, total] = await Promise.all([
    Student.find(q).populate('user', 'email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Student.countDocuments(q),
  ]);
  res.json({ students, total, page, pages: Math.ceil(total / limit) });
}));

router.get('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id).populate('user', 'email');
  if (!student) return res.status(404).json({ message: 'Student not found' });
  res.json(student);
}));

router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: 'Student not found' });
  if (student.resume) fs.unlink(path.join(__dirname, '..', student.resume), () => {});
  await Promise.all([
    Application.deleteMany({ student: student._id }),
    Interview.deleteMany({ student: student._id }),
    Result.deleteMany({ student: student._id }),
    Notification.deleteMany({ user: student.user }),
  ]);
  await User.findByIdAndDelete(student.user);
  await student.deleteOne();
  res.json({ message: 'Student removed' });
}));

module.exports = router;
