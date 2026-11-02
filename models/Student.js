const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    // One User has exactly one Student profile
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: [true, 'Name is required'], trim: true },
    rollNumber: {
      type: String,
      required: [true, 'Roll number is required'],
      unique: true,
      trim: true,
      match: [/^\d{11}$/, 'Roll number must be exactly 11 digits']
    },
    phone: { type: String, trim: true },
    department: { type: String, trim: true },
    degree: { type: String, trim: true },
    passingYear: Number,
    cgpa: { type: Number, min: 0, max: 10 },
    percentage: { type: Number, min: 0, max: 100 },
    tenthPercentage: { type: Number, min: 0, max: 100 },
    twelfthPercentage: { type: Number, min: 0, max: 100 },
    backlogs: { type: Number, default: 0, min: 0 },
    resume: String,
    placementStatus: { type: String, enum: ['Unplaced', 'Placed'], default: 'Unplaced' },
    placedCompany: String,
    placedPackage: Number,
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

studentSchema.index({ department: 1, passingYear: 1, cgpa: -1 });

studentSchema.virtual('profileCompletion').get(function () {
  const fields = ['rollNo', 'phone', 'department', 'degree', 'passingYear', 'cgpa', 'percentage', 'tenthPercentage', 'twelfthPercentage', 'resume'];
  const filled = fields.filter((f) => this[f] !== undefined && this[f] !== null && this[f] !== '').length;
  return Math.round((filled / fields.length) * 100);
});

module.exports = mongoose.model('Student', studentSchema);
