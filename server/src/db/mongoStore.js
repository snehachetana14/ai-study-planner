// MongoDB (Mongoose) implementation of the store interface used by the services.
// Every collection offers: find(filter), findOne(filter), insert(doc), update(filter, patch), remove(filter).
const mongoose = require('mongoose');

function toPlain(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: String(_id), ...rest };
}

// Translate { id } into { _id } and reject ids that are not valid ObjectIds.
function toQuery(filter = {}) {
  const query = { ...filter };
  if ('id' in query) {
    if (!mongoose.isValidObjectId(query.id)) return null;
    query._id = query.id;
    delete query.id;
  }
  return query;
}

function wrap(Model) {
  return {
    async find(filter) {
      const q = toQuery(filter);
      if (!q) return [];
      return (await Model.find(q).lean()).map(toPlain);
    },
    async findOne(filter) {
      const q = toQuery(filter);
      if (!q) return null;
      return toPlain(await Model.findOne(q).lean());
    },
    async insert(doc) {
      const created = await Model.create({ createdAt: new Date().toISOString(), ...doc });
      return toPlain(created.toObject());
    },
    async update(filter, patch) {
      const q = toQuery(filter);
      if (!q) return null;
      const updated = await Model.findOneAndUpdate(q, { $set: patch }, { new: true, runValidators: true }).lean();
      return toPlain(updated);
    },
    async upsert(filter, patch) {
      const q = toQuery(filter);
      const updated = await Model.findOneAndUpdate(q, { $set: patch }, { new: true, upsert: true }).lean();
      return toPlain(updated);
    },
    async remove(filter) {
      const q = toQuery(filter);
      if (!q) return 0;
      const res = await Model.deleteMany(q);
      return res.deletedCount || 0;
    },
  };
}

async function createMongoStore(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const models = require('../models');
  return {
    kind: 'mongodb',
    users: wrap(models.User),
    courses: wrap(models.Course),
    assignments: wrap(models.Assignment),
    schedules: wrap(models.Schedule),
    attendance: wrap(models.AttendanceLog),
    notifications: wrap(models.Notification),
    close: () => mongoose.disconnect(),
  };
}

module.exports = { createMongoStore };
