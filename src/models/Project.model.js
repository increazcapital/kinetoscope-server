const mongoose = require('mongoose');

/**
 * Project Schema representing investments-supporting projects catalog.
 */
const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
    },
    segment: {
      type: String,
      required: [true, 'Segment is required'],
      trim: true,
    },
    status: {
      type: String,
      required: [true, 'Status is required'],
      trim: true,
    },
    portfolioValue: {
      type: String,
      required: [true, 'Portfolio value description is required'],
      trim: true,
    },
    monthlyRoi: {
      type: String,
      required: [true, 'Monthly ROI value description is required'],
      trim: true,
    },
    riskLevel: {
      type: String,
      enum: {
        values: ['Low', 'Medium', 'Medium High', 'High'],
        message: 'Risk Level must be either Low, Medium, Medium High, or High',
      },
      default: 'Medium',
    },
    milestoneProgress: {
      type: Number,
      default: 0,
      min: [0, 'Milestone progress percentage cannot be below 0'],
      max: [100, 'Milestone progress percentage cannot exceed 100'],
    },
    minInvestment: {
      type: Number,
      default: 200000,
      min: [0, 'Minimum investment amount cannot be negative'],
    },
    targetFunding: {
      type: Number,
      default: 25000000,
      min: [0, 'Target funding cannot be negative'],
    },
    fundedAmount: {
      type: Number,
      default: 0,
      min: [0, 'Funded amount cannot be negative'],
    },
    totalSlots: {
      type: Number,
      default: 20,
      min: [1, 'Total slots must be at least 1'],
    },
    slotsAvailable: {
      type: Number,
      default: 20,
      min: [0, 'Slots available cannot be negative'],
    },
    health: {
      type: String,
      enum: {
        values: ['On Track', 'Active', 'Performing', 'Building', 'Planned', 'At Risk', 'Completed', 'Under Review'],
        message: 'Health must be either On Track, Active, Performing, Building, Planned, At Risk, Completed, or Under Review',
      },
      default: 'On Track',
    },
    bannerImage: {
      type: String,
      default: '',
    },
    mediaFiles: {
      type: [String],
      default: [],
    },
    summary: {
      type: String,
      default: '',
      trim: true,
    },
    currentUpdate: {
      type: String,
      default: '',
      trim: true,
    },
    allocationFocus: {
      type: String,
      default: '',
      trim: true,
    },
    totalDividendPool: {
      type: Number,
      default: 0,
      min: [0, 'Total dividend pool cannot be negative'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Project creator is required'],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
projectSchema.index({ segment: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ health: 1 });

const Project = mongoose.model('Project', projectSchema);

module.exports = Project;
