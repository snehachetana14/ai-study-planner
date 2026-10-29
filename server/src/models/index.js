// Mongoose schemas for the six collections.
// Dates are stored as ISO strings so the MongoDB and file stores behave the same way.
const mongoose = require('mongoose');

const { Schema } = mongoose;
const opts = { versionKey: false, minimize: false };

const UserSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  settings: { type: Schema.Types.Mixed, default: {} },
  createdAt: String,
}, opts);

const CourseSchema = new Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, default: '' },
  color: { type: String, default: '#4f7cff' },
  minAttendance: { type: Number, default: 75 },
  createdAt: String,
}, opts);

const AssignmentSchema = new Schema({
  userId: { type: String, required: true, index: true },
  courseId: { type: String, required: true },
  title: { type: String, required: true, trim: true },
  type: { type: String, enum: ['assignment', 'exam', 'quiz'], default: 'assignment' },
  deadline: { type: String, required: true },
  weight: { type: Number, min: 0, max: 100, required: true },
  difficulty: { type: Number, min: 1, max: 5, required: true },
  estimatedHours: { type: Number, min: 0.5, max: 40, required: true },
  status: { type: String, enum: ['pending', 'done'], default: 'pending' },
  createdAt: String,
  completedAt: String,
}, opts);

const SessionSchema = new Schema({
  id: String,
  taskId: String,
  date: String,
  start: String,
  hours: Number,
  status: { type: String, enum: ['planned', 'done', 'missed'], default: 'planned' },
  reason: String,
  completedAt: String,
}, { _id: false });

const ScheduleSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  sessions: { type: [SessionSchema], default: [] },
  source: { type: String, default: 'none' },
  sourceNote: String,
  warnings: { type: [String], default: [] },
  unscheduled: { type: Schema.Types.Mixed, default: [] },
  generatedAt: String,
  generatedFor: String,
  previous: { type: Schema.Types.Mixed, default: null },
}, opts);

const AttendanceLogSchema = new Schema({
  userId: { type: String, required: true, index: true },
  courseId: { type: String, required: true },
  date: { type: String, required: true },
  present: { type: Boolean, required: true },
  createdAt: String,
}, opts);

const NotificationSchema = new Schema({
  userId: { type: String, required: true, index: true },
  key: { type: String, index: true },
  kind: String,
  level: { type: String, default: 'info' },
  title: String,
  body: String,
  read: { type: Boolean, default: false },
  createdAt: String,
}, opts);

module.exports = {
  User: mongoose.model('User', UserSchema),
  Course: mongoose.model('Course', CourseSchema),
  Assignment: mongoose.model('Assignment', AssignmentSchema),
  Schedule: mongoose.model('Schedule', ScheduleSchema),
  AttendanceLog: mongoose.model('AttendanceLog', AttendanceLogSchema),
  Notification: mongoose.model('Notification', NotificationSchema),
};
