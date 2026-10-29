const svc = require('../services/ReplanningService');
const { notify } = require('../services/NotificationService');
const { withDefaults, hoursFor } = require('../services/settingsService');
const { HttpError } = require('../middleware/errorHandler');

const ctxOf = (req) => ({ aiClient: req.ctx.aiClient });

async function view(req, userId) {
  return svc.getScheduleView(req.ctx.store, userId, { ...ctxOf(req), refresh: false });
}

async function getSchedule(req, res) {
  res.json(await svc.getScheduleView(req.ctx.store, req.userId, ctxOf(req)));
}

async function replan(req, res) {
  const { changes } = await svc.replanForUser(req.ctx.store, req.userId, ctxOf(req));
  res.json({ schedule: await view(req, req.userId), changes });
}

async function undo(req, res) {
  await svc.undo(req.ctx.store, req.userId);
  res.json({ schedule: await view(req, req.userId) });
}

// Student's choice for work that no longer fits before its deadline (Assessment 9, Screen 3).
async function resolveConflict(req, res) {
  const { store } = req.ctx;
  const { taskId, action } = req.body || {};
  const schedule = await store.schedules.findOne({ userId: req.userId });
  const conflict = schedule && (schedule.unscheduled || []).find((u) => u.taskId === taskId);
  if (!conflict) throw new HttpError(404, 'That conflict is already resolved');
  const task = await store.assignments.findOne({ id: taskId, userId: req.userId });
  if (!task) throw new HttpError(404, 'Task not found');

  if (action === 'addHours') {
    const option = conflict.options.find((o) => o.action === 'addHours');
    if (!option) throw new HttpError(400, 'There is no study day left before this deadline');
    const settings = withDefaults(req.user.settings);
    const snapshot = svc.snapshotOf(schedule, settings);
    settings.overrides[option.date] = Math.min(16, hoursFor(settings, option.date) + option.hours);
    await store.users.update({ id: req.userId }, { settings });
    const { changes } = await svc.replanForUser(store, req.userId, { ...ctxOf(req), previous: snapshot });
    return res.json({ schedule: await view(req, req.userId), changes });
  }

  if (action === 'remind') {
    const notification = await notify(store, req.userId, {
      key: `conflict:${taskId}:${conflict.hoursLeft}:${schedule.generatedAt}`,
      kind: 'conflict',
      level: 'warning',
      title: `${task.title} needs ${conflict.hoursLeft} h more`,
      body: 'It does not fit before the deadline. Find extra time or ask for an extension.',
    });
    return res.json({ schedule: await view(req, req.userId), notification });
  }

  throw new HttpError(400, 'Action must be addHours or remind');
}

async function setSessionStatus(req, res) {
  const { changes } = await svc.setSessionStatus(req.ctx.store, req.userId, req.params.id, req.body || {}, ctxOf(req));
  res.json({ schedule: await view(req, req.userId), changes });
}

module.exports = { getSchedule, replan, undo, resolveConflict, setSessionStatus, view };
