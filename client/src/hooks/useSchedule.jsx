import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import MissedFlow from '../components/MissedFlow.jsx';

// Loads the schedule view (sessions, tasks, courses, ranking, free hours).
export function useSchedule() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    return api('/schedule').then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);
  return { data, setData, load, error };
}

// Done / Missed / Undo / conflict choices, shared by the Dashboard and Schedule pages.
export function useScheduleActions(data, setData) {
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);
  const [missing, setMissing] = useState(null);

  const undo = useCallback(async () => {
    try {
      const res = await api('/schedule/undo', { method: 'POST' });
      setData(res.schedule);
      toast({ text: 'Previous plan restored', tone: 'info' });
    } catch (err) {
      toast({ text: err.message, tone: 'error' });
    }
  }, [setData, toast]);

  const setStatus = useCallback(async (session, status) => {
    setBusyId(session.id);
    try {
      const res = await api(`/sessions/${session.id}`, { method: 'PATCH', body: { status } });
      setData(res.schedule);
      if (status === 'done') {
        const task = res.schedule.tasks.find((t) => t.id === session.taskId);
        const finished = task && task.status === 'done';
        toast({ text: finished ? `Nice work: ${task.title} is complete` : 'Session marked done' });
      }
    } catch (err) {
      toast({ text: err.message, tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }, [setData, toast]);

  const resolve = useCallback(async (taskId, action) => {
    try {
      const res = await api('/schedule/resolve', { method: 'POST', body: { taskId, action } });
      setData(res.schedule);
      if (action === 'remind') toast({ text: 'Reminder added to your notifications', tone: 'info' });
      else toast({ text: 'Hours added and plan updated', action: { label: 'Undo', onClick: undo } });
      return res;
    } catch (err) {
      toast({ text: err.message, tone: 'error' });
      throw err;
    }
  }, [setData, toast, undo]);

  const missedFlow = missing && data ? (
    <MissedFlow
      session={missing}
      schedule={data}
      onClose={() => setMissing(null)}
      onUpdated={setData}
      onUndo={() => { setMissing(null); undo(); }}
      onResolve={resolve}
    />
  ) : null;

  return {
    busyId,
    markDone: (s) => setStatus(s, 'done'),
    unmark: (s) => setStatus(s, 'planned'),
    startMissed: setMissing,
    undo,
    resolve,
    missedFlow,
  };
}

// Instant (ms) when a session starts, in the student's time zone.
export const sessionStartMs = (s, tz) => Date.parse(`${s.date}T${s.start}:00Z`) - tz * 60000;
export const sessionEndMs = (s, tz) => sessionStartMs(s, tz) + s.hours * 3600000;
