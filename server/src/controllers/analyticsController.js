// Insights (burnout analytics), notifications, settings and sample data.
const { analyze } = require('../services/BurnoutAnalyzer');
const { withDefaults } = require('../services/settingsService');
const { runChecks, checkUser } = require('../services/NotificationService');
const { seedDemo } = require('../services/demoData');
const svc = require('../services/ReplanningService');
const { view } = require('./scheduleController');

async function insights(req, res) {
  const { store } = req.ctx;
  const settings = withDefaults(req.user.settings);
  const [schedule, tasks] = await Promise.all([
    store.schedules.findOne({ userId: req.userId }),
    store.assignments.find({ userId: req.userId }),
  ]);
  res.json(analyze({ sessions: (schedule && schedule.sessions) || [], tasks, tz: settings.tzOffsetMin }));
}

async function listNotifications(req, res) {
  const { store } = req.ctx;
  await checkUser(store, req.user, Date.now());
  const items = (await store.notifications.find({ userId: req.userId }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);
  res.json({ items, unread: items.filter((n) => !n.read).length });
}

async function markRead(req, res) {
  const { store } = req.ctx;
  if (req.body && req.body.id) {
    await store.notifications.update({ id: req.body.id, userId: req.userId }, { read: true });
  } else {
    for (const n of await store.notifications.find({ userId: req.userId, read: false })) {
      await store.notifications.update({ id: n.id }, { read: true });
    }
  }
  res.json({ ok: true });
}

async function getSettings(req, res) {
  res.json({ name: req.user.name, settings: withDefaults(req.user.settings), aiProvider: req.ctx.aiClient ? req.ctx.aiClient.provider : null });
}

async function updateSettings(req, res) {
  const { store } = req.ctx;
  const current = withDefaults(req.user.settings);
  const next = { ...current };
  for (const k of ['weeklyHours', 'startTimes', 'tzOffsetMin', 'useAI', 'reminderMinutes', 'overrides']) {
    if (k in req.body) next[k] = req.body[k];
  }
  const patch = { settings: next };
  if (req.body.name) patch.name = String(req.body.name).trim();
  const user = await store.users.update({ id: req.userId }, patch);
  req.user = user;
  const existing = await store.schedules.findOne({ userId: req.userId });
  const { changes } = await svc.replanForUser(store, req.userId, {
    aiClient: req.ctx.aiClient,
    previous: svc.snapshotOf(existing, current),
  });
  res.json({ name: user.name, settings: withDefaults(user.settings), schedule: await view(req, req.userId), changes });
}

async function seed(req, res) {
  const { store } = req.ctx;
  await seedDemo(store, req.userId);
  await svc.replanForUser(store, req.userId, { aiClient: req.ctx.aiClient, previous: null });
  await runChecks(store);
  res.json({ schedule: await view(req, req.userId) });
}

module.exports = { insights, listNotifications, markRead, getSettings, updateSettings, seed };
