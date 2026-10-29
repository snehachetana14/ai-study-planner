// "Why this order?" panel (Screen 1, marker 7): each task's score and the three reasons behind it.
export default function WhyOrder({ schedule }) {
  const courseById = new Map(schedule.courses.map((c) => [c.id, c]));
  if (!schedule.ranked.length) return null;

  return (
    <section className="card why" aria-labelledby="why-title">
      <div className="card-head">
        <h2 id="why-title">Why this order?</h2>
        <span className="small muted">score = 50% deadline + 30% weight + 20% difficulty</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th>Task</th>
              <th style={{ width: 110 }}>Score</th>
              <th>Reasons</th>
            </tr>
          </thead>
          <tbody>
            {schedule.ranked.map((t, i) => {
              const course = courseById.get(t.courseId);
              return (
                <tr key={t.id}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <div className="row">
                      <span className="color-dot" style={{ background: course ? course.color : '#999' }} />
                      <span style={{ fontWeight: 600 }}>{t.title}</span>
                    </div>
                    <div className="small muted">{course ? course.name : ''}</div>
                  </td>
                  <td><span className="score">{Math.round(t.score)}</span> <span className={`badge badge-${t.label}`}>{t.label}</span></td>
                  <td className="muted">{t.reasons.due} · {t.reasons.weight}% of grade · difficulty {t.reasons.difficulty}/5</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
