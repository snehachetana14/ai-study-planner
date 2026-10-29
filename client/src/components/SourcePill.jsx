import { timeAgo } from '../utils/format.js';

// Shows whether the plan came from the AI or from the rule-based fallback (Screen 1, marker 4).
export default function SourcePill({ schedule }) {
  if (!schedule || !schedule.source || schedule.source === 'none') return null;
  const when = schedule.generatedAt ? ` · updated ${timeAgo(schedule.generatedAt)}` : '';
  if (schedule.source === 'ai') {
    return <span className="pill pill-good" title={schedule.sourceNote}>✓ Planned by AI{when}</span>;
  }
  return (
    <span className="pill" title={(schedule.warnings || []).join('\n') || schedule.sourceNote}>
      Planned by rules{schedule.sourceNote ? ` · ${schedule.sourceNote}` : ''}{when}
    </span>
  );
}
