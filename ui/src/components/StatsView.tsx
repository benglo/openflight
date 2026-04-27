import { useMemo, useState } from 'react';
import { useUnitPreference } from '../state/useUnitPreference';
import type { Shot } from '../types/shot';
import { computeStats, getUniqueClubs } from '../types/shot';
import { formatDistance, formatSpeed, getDistanceUnit, getSpeedUnit } from '../utils/units';
import { EditableDashboard } from './EditableDashboard';
import { DashboardKey } from '../hooks/useDashboardLayouts';
import './StatsView.css';

interface StatsViewProps {
  shots: Shot[];
  onClearSession: () => void;
}

// Stable card ids matching the hook's default Stats layout.
const STATS_CARD_IDS = [
  'avg_carry',
  'shots',
  'avg_ball',
  'max_ball',
  'avg_club',
  'avg_smash',
] as const;

// Friendly labels for EditableDashboard's hidden-cards drawer.
const STATS_CARD_LABELS: Record<string, string> = {
  avg_carry: 'Avg Carry',
  shots: 'Shots',
  avg_ball: 'Avg Ball',
  max_ball: 'Max Ball',
  avg_club: 'Avg Club',
  avg_smash: 'Avg Smash',
};

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
       * Stats cards. We use plain divs (not <dl>/<dt>/<dd>) here because
       * the EditableDashboard wraps each child in a positioned div for
       * react-grid-layout, which would break the description-list
       * association. The section's aria-labelledby + h2 gives screen
       * readers a structured "Session Stats" announcement and each card
       * has a label-then-value pair that's still readable in document
       * order.
       *
       * Avg Carry is the single hero — it spans the full row at the top
       * because it's the answer most golfers care about. Avg Ball was
       * previously also marked --primary but two primaries is no primary;
       * it's now part of the supporting strip below.
       *
       * Cards always render even when their value is missing (Avg Club,
       * Avg Smash) — show "—" so the editable dashboard has stable card
       * ids to bind layouts to.
       */}
      <EditableDashboard
        view={DashboardKey.Stats}
        cardIds={STATS_CARD_IDS}
        cardLabels={STATS_CARD_LABELS}
      >
        <div key="avg_carry" className="stat-card stat-card--primary">
          <span className="stat-card__label">Avg Carry ({distanceUnit})</span>
          <span className="stat-card__value">{formatDistance(stats.avg_carry_est, unitSystem, 0)}</span>
        </div>
        <div key="shots" className="stat-card">
          <span className="stat-card__label">Shots</span>
          <span className="stat-card__value">{stats.shot_count}</span>
        </div>
        <div key="avg_ball" className="stat-card">
          <span className="stat-card__label">Avg Ball ({speedUnit})</span>
          <span className="stat-card__value">{formatSpeed(stats.avg_ball_speed, unitSystem, 1)}</span>
        </div>
        <div key="max_ball" className="stat-card">
          <span className="stat-card__label">Max Ball ({speedUnit})</span>
          <span className="stat-card__value">{formatSpeed(stats.max_ball_speed, unitSystem, 1)}</span>
        </div>
        <div key="avg_club" className="stat-card">
          <span className="stat-card__label">Avg Club ({speedUnit})</span>
          <span className="stat-card__value">
            {stats.avg_club_speed ? formatSpeed(stats.avg_club_speed, unitSystem, 1) : '—'}
          </span>
        </div>
        <div key="avg_smash" className="stat-card">
          <span className="stat-card__label">Avg Smash</span>
          <span className="stat-card__value">
            {stats.avg_smash_factor ? stats.avg_smash_factor.toFixed(2) : '—'}
          </span>
        </div>
      </EditableDashboard>

      <button type="button" className="clear-button" onClick={onClearSession}>
        Clear Session
      </button>
    </section>
  );
}
