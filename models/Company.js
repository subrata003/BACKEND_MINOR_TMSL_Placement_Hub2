const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Company name is required'], unique: true, trim: true },
    website: String,
    industry: String,
    location: String,
    description: String,
    contactEmail: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Company', companySchema);
