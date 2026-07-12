import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Spinner, Countdown, ErrorNote } from '../components/ui';
import { fmtPoints } from '../utils/format';

export default function Bonus() {
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    const d = await api.bonus();
    setQuestions(d.questions);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  if (!questions) return <Spinner />;

  async function answer(q, body) {
    setError(null);
    try {
      await api.answerBonus(q.id, body);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">Bonusvragen ⭐</h1>
      <p className="text-sm text-emerald-50/50">
        Extra punten! Antwoorden worden automatisch nagekeken zodra de uitslag vaststaat.
      </p>
      <ErrorNote error={error} />

      {questions.map((q) => (
        <div key={q.id} className="card space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-bold">{q.question_nl}</div>
              <div className="text-xs text-emerald-50/40">
                {q.points} punten{q.points_close > 0 && ` (±1: ${q.points_close})`} ·{' '}
                {q.resolved ? (
                  'afgerond'
                ) : q.is_locked ? (
                  'gesloten'
                ) : (
                  <>sluit over <Countdown iso={q.deadline_utc} /></>
                )}
              </div>
            </div>
            {q.earned_points != null && (
              <span className={`chip ${q.earned_points > 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-emerald-50/40'}`}>
                +{fmtPoints(q.earned_points)}
              </span>
            )}
          </div>

          {q.resolved && (
            <div className="rounded-xl bg-white/[0.04] p-2 text-sm">
              Uitslag:{' '}
              <b>
                {q.correct_team_name ? `${q.correct_team_flag} ${q.correct_team_name}` : null}
                {q.correct_names ? q.correct_names.join(' / ') : null}
                {q.correct_number != null ? `${q.correct_number} punten` : null}
              </b>
            </div>
          )}

          {q.answer_type === 'team' && (
            <div className="grid grid-cols-2 gap-2">
              {q.choices?.map((c) => {
                const selected = q.answer_team_id === c.id;
                return (
                  <button
                    key={c.id}
                    disabled={q.is_locked}
                    onClick={() => answer(q, { answer_team_id: c.id })}
                    className={`btn justify-start ${selected ? 'bg-oranje-500 text-pitch-950' : 'btn-ghost'} disabled:opacity-60`}
                  >
                    <span className="text-lg">{c.flag}</span> {c.name_nl}
                    {selected && ' ✓'}
                  </button>
                );
              })}
            </div>
          )}

          {q.answer_type === 'player' && (
            <PlayerInput q={q} onSave={(text) => answer(q, { answer_text: text })} />
          )}

          {q.answer_type === 'number' && (
            <NumberInput q={q} onSave={(n) => answer(q, { answer_number: n })} />
          )}
        </div>
      ))}
    </div>
  );
}

function PlayerInput({ q, onSave }) {
  const [text, setText] = useState(q.answer_text || '');
  return (
    <div className="flex gap-2">
      <input
        className="input"
        placeholder="Bijv. Memphis Depay"
        value={text}
        disabled={q.is_locked}
        onChange={(e) => setText(e.target.value)}
      />
      {!q.is_locked && (
        <button className="btn-primary" onClick={() => onSave(text)} disabled={text.trim().length < 2}>
          {q.answer_text ? 'Wijzig' : 'Opslaan'}
        </button>
      )}
    </div>
  );
}

function NumberInput({ q, onSave }) {
  const [n, setN] = useState(q.answer_number ?? 10);
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={18}
        value={n}
        disabled={q.is_locked}
        onChange={(e) => setN(Number(e.target.value))}
        className="flex-1 accent-oranje-500"
      />
      <span className="w-8 text-center text-xl font-black tabular-nums">{n}</span>
      {!q.is_locked && (
        <button className="btn-primary" onClick={() => onSave(n)}>
          {q.answer_number != null ? 'Wijzig' : 'Opslaan'}
        </button>
      )}
    </div>
  );
}
