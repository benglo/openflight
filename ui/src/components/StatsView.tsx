import { useMemo, useState } from 'react';
import { useUnitPreference } from '../state/useUnitPreference';
import type { Shot } from '../types/shot';
import { computeStats, getUniqueClubs } from '../types/shot';
import { formatDistance, formatSpeed, getDistanceUnit, getSpeedUnit } from '../utils/units';
import './StatsView.css';

interface StatsViewProps {
  shots: Shot[];
  onClearSession: () => void;
}

export function StatsView({ shots, onClearSession }: StatsViewProps) {
  const [selectedClub, setSelectedClub] = useState<string | null>(null);
  const { unitSystem } = useUnitPreference();
  const speedUnit = getSpeedUnit(unitSystem);
  const distanceUnit = getDistanceUnit(unitSystem);

  const availableClubs = useMemo(() => getUniqueClubs(shots), [shots]);

  const clubCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const shot of shots) {
      counts[shot.club] = (counts[shot.club] || 0) + 1;
    }
    return counts;
  }, [shots]);

  const filteredShots = useMemo(() => {
    if (selectedClub === null) return shots;
    return shots.filter((s) => s.club === selectedClub);
  }, [shots, selectedClub]);

  const stats = useMemo(() => computeStats(filteredShots), [filteredShots]);

  if (shots.length === 0) {
    return (
      <section className="stats-view stats-view--empty" aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="visually-hidden">
          Session Stats
        </h2>
        <p>No shots recorded yet</p>
      </section>
    );
  }

  return (
    <section className="stats-view" aria-labelledby="stats-heading">
      <h2 id="stats-heading" className="visually-hidden">
        Session Stats
      </h2>

      {/*
       * Filter tabs. Using aria-pressed (toggle-button semantics) rather
       * than role="tab" because each click changes the displayed dataset
       * in place — no separate tabpanels — and aria-pressed gives a
       * better screen-reader announcement for that pattern.
       */}
      <div className="club-tabs" role="group" aria-label="Filter shots by club">
        <button
          type="button"
          className={`club-tabs__tab ${selectedClub === null ? 'club-tabs__tab--active' : ''}`}
          aria-pressed={selectedClub === null}
          onClick={() => setSelectedClub(null)}
        >
          All ({shots.length})
        </button>
        {availableClubs.map((club) => (
          <button
            key={club}
            type="button"
            className={`club-tabs__tab ${selectedClub === club ? 'club-tabs__tab--active' : ''}`}
            aria-pressed={selectedClub === club}
            onClick={() => setSelectedClub(club)}
          >
            {club.toUpperCase()} ({clubCounts[club] || 0})
          </button>
        ))}
      </div>

      {/*
       * Description-list for the stats grid: each card is a (term, value)
       * pair. Screen readers announce these as definitions, which matches
       * the user's mental model ("Avg Carry: 240 yards") far better than
       * a div soup of spans.
       */}
      <dl className="stats-grid">
        <div className="stat-card">
          <dt className="stat-card__label">Shots</dt>
          <dd className="stat-card__value">{stats.shot_count}</dd>
        </div>
        <div className="stat-card stat-card--primary">
          <dt className="stat-card__label">Avg Ball ({speedUnit})</dt>
          <dd className="stat-card__value">{formatSpeed(stats.avg_ball_speed, unitSystem, 1)}</dd>
        </div>
        <div className="stat-card">
          <dt className="stat-card__label">Max Ball ({speedUnit})</dt>
          <dd className="stat-card__value">{formatSpeed(stats.max_ball_speed, unitSystem, 1)}</dd>
        </div>
        <div className="stat-card stat-card--primary">
          <dt className="stat-card__label">Avg Carry ({distanceUnit})</dt>
          <dd className="stat-card__value">{formatDistance(stats.avg_carry_est, unitSystem, 0)}</dd>
        </div>
        {stats.avg_club_speed && (
          <div className="stat-card">
            <dt className="stat-card__label">Avg Club ({speedUnit})</dt>
            <dd className="stat-card__value">{formatSpeed(stats.avg_club_speed, unitSystem, 1)}</dd>
          </div>
        )}
        {stats.avg_smash_factor && (
          <div className="stat-card">
            <dt className="stat-card__label">Avg Smash</dt>
            <dd className="stat-card__value">{stats.avg_smash_factor.toFixed(2)}</dd>
          </div>
        )}
      </dl>

      <button type="button" className="clear-button" onClick={onClearSession}>
        Clear Session
      </button>
    </section>
  );
}
