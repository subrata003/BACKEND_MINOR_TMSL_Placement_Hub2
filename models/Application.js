const mongoose = require('mongoose');

const STATUSES = ['Applied', 'Under Review', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Rejected', 'Withdrawn'];

const applicationSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    status: { type: String, enum: STATUSES, default: 'Applied' },
    history: [{ status: String, at: { type: Date, default: Date.now } }],
  },
  { timestamps: true }
);

// A student cannot apply twice for the same job
applicationSchema.index({ student: 1, job: 1 }, { unique: true });

applicationSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('status')) this.history.push({ status: this.status });
  next();
});

applicationSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('Application', applicationSchema);
