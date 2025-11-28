// models/comic.js
const mongoose = require('mongoose');

const panelSchema = new mongoose.Schema({
  panelNumber: {
    type: Number,
    required: true
  },
  fileName: String,
  imagePath: String,
  dialogue: String,
  action: String,
  setting: String,
  error: String
});

const characterSchema = new mongoose.Schema({
  name: String,
  description: String,
  role: String
});

const sceneSchema = new mongoose.Schema({
  panelNumber: Number,
  setting: String,
  action: String,
  dialogue: String,
  characters: [String],
  mood: String
});

const comicSchema = new mongoose.Schema({
  comicId: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['generating_story', 'generating_images', 'completed', 'error'],
    default: 'generating_story'
  },
  progress: {
    type: Number,
    default: 0
  },
  currentStep: {
    type: String,
    default: 'Starting...'
  },
  story: {
    title: String,
    summary: String,
    genre: String,
    characters: [characterSchema],
    scenes: [sceneSchema]
  },
  images: {
    folder: String,
    panels: [panelSchema]
  },
  error: String,
  // User who created the comic (optional, if you want to track creators)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date
}, {
  timestamps: true
});

// Index for faster queries
comicSchema.index({ comicId: 1 });
comicSchema.index({ status: 1 });
comicSchema.index({ createdAt: -1 });

const Comic = mongoose.model('Comic', comicSchema);

module.exports = Comic;