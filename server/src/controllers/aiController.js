// AI Quick Add: POST /api/ai/quick-add { text } -> task fields for the Add Task form.
// Nothing is saved here: the student checks the filled form and confirms (human in the loop).
const { HttpError } = require('../middleware/errorHandler');
const { withDefaults } = require('../services/settingsService');
const { quickAdd } = require('../ai/TaskParser');

async function quickAddTask(req, res) {
  const text = String((req.body && req.body.text) || '').trim();
  if (text.length < 3 || text.length > 500) {
    throw new HttpError(400, 'Type a sentence of 3–500 characters', { text: 'Type a sentence of 3–500 characters' });
  }
  const courses = await req.ctx.store.courses.find({ userId: req.userId });
  if (!courses.length) throw new HttpError(400, 'Add a course first, then use Quick Add');
  const result = await quickAdd({
    text,
    courses,
    aiClient: req.ctx.aiClient,
    tz: withDefaults(req.user.settings).tzOffsetMin,
  });
  res.json(result);
}

module.exports = { quickAddTask };
