import { useMemo } from 'react';
import type { Shot } from '../types/shot';
import type { SimResult } from '../hooks/useSocket';
import { useUnitPreference } from '../state/useUnitPreference';
import { formatCarryRange, formatDistance, formatSpeed, getDistanceUnit, getSpeedUnit } from '../utils/units';
import { EditableDashboard } from './EditableDashboard';
import { DashboardKey } from '../hooks/useDashboardLayouts';
import './ShotDisplay.css';

// Stable card ids for the editable dashboard. Order doesn't drive
// placement (the layout does), but the set must match exactly the
// MetricCards rendered below.
const LIVE_CARD_IDS = [
  'carry',
  'club_speed',
  'v_launch',
  'club_aoa',
  'club_path',
  'spin_axis',
  'h_launch',
  'spin_rpm',
  'sim_carry',
  'sim_total',
  'sim_lateral',
  'sim_apex',
] as const;

// Friendly labels — used by EditableDashboard's "hidden cards" drawer
// so users see "Spin Rate" rather than "spin_rpm" when re-adding a
// card. Keep in sync with LIVE_CARD_IDS / the MetricCard `label` props.
const LIVE_CARD_LABELS: Record<string, string> = {
  carry: 'Est. Carry',
  club_speed: 'Club Speed',
  v_launch: 'V. Launch',
  club_aoa: 'Club AoA',
  club_path: 'Club Path',
  spin_axis: 'Spin Axis',
  h_launch: 'H. Launch',
  spin_rpm: 'Spin Rate',
  sim_carry: 'Sim Carry',
  sim_total: 'Sim Total',
  sim_lateral: 'Sim Lateral',
  sim_apex: 'Sim Apex',
};

interface ShotDisplayProps {
  shot: Shot | null;
  animate?: boolean;
  /** Latest normalized result from whichever external sim is connected. */
  simResult?: SimResult | null;
}

// Friendly labels for sim sources — fall back to the raw key if a new
// integration shows up that we haven't labeled yet.
const SIM_SOURCE_LABELS: Record<string, string> = {
  opengolfsim: 'OpenGolfSim',
  gspro: 'GSPro',
  e6: 'E6 Connect',
  tgc: 'TGC 2019',
};

const GAUGE_MIN = 0;
const GAUGE_MAX = 200; // mph
const GAUGE_START_ANGLE = -140;
const GAUGE_END_ANGLE = 140;

function SpeedGauge({
  speedMph,
  label,
  displayValue,
  unit,
}: {
  speedMph: number;
  label: string;
  displayValue: string;
  unit: string;
}) {
  const percentage = Math.min(Math.max((speedMph - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN), 0), 1);
  const angle = GAUGE_START_ANGLE + (GAUGE_END_ANGLE - GAUGE_START_ANGLE) * percentage;

  const radius = 85;
  const cx = 100;
  const cy = 100;

  const polarToCartesian = (centerX: number, centerY: number, r: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + r * Math.cos(angleInRadians),
      y: centerY + r * Math.sin(angleInRadians),
    };
  };

  const describeArc = (startAngle: number, endAngle: number) => {
    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
  };

  const backgroundArc = describeArc(GAUGE_START_ANGLE, GAUGE_END_ANGLE);
  const valueArc = describeArc(GAUGE_START_ANGLE, angle);

  return (
    <div className="speed-gauge">
      <svg viewBox="0 0 200 140" className="speed-gauge__svg">
        <path d={backgroundArc} fill="none" stroke="rgba(245, 240, 230, 0.1)" strokeWidth="12" strokeLinecap="round" />
        <path
          d={valueArc}
          fill="none"
          stroke="url(#goldGradient)"
          strokeWidth="12"
          strokeLinecap="round"
          className="speed-gauge__value-arc"
        />
        <defs>
          <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#A68B2A" />
            <stop offset="100%" stopColor="#F4CF47" />
          </linearGradient>
        </defs>
      </svg>
      <div className="speed-gauge__content">
        <span className="speed-gauge__value">{displayValue}</span>
        <span className="speed-gauge__unit">{unit}</span>
        <span className="speed-gauge__label">{label}</span>
      </div>
    </div>
  );
}

function MetricCard({
  value,
  unit,
  label,
  subtext,
  variant = 'default',
  confidence,
}: {
  value: string | number;
  unit?: string;
  label: string;
  subtext?: string;
  variant?: 'default' | 'primary' | 'secondary' | 'spin';
  confidence?: 'high' | 'medium' | 'low' | null;
}) {
  return (
    <div className={`metric-card metric-card--${variant}`}>
      <div className="metric-card__value-row">
        <span className="metric-card__value">{value}</span>
        {unit && <span className="metric-card__unit">{unit}</span>}
      </div>
      <span className="metric-card__label">{label}</span>
      {subtext && <span className="metric-card__subtext">{subtext}</span>}
      {confidence && (
        <div className={`metric-card__confidence metric-card__confidence--${confidence}`}>
          <span className="metric-card__confidence-dots">
            <span className="dot filled" />
            <span className={`dot ${confidence === 'medium' || confidence === 'high' ? 'filled' : ''}`} />
            <span className={`dot ${confidence === 'high' ? 'filled' : ''}`} />
          </span>
          <span className="metric-card__confidence-label">{confidence}</span>
        </div>
      )}
    </div>
  );
}

function formatSpinRpm(rpm: number): string {
  return rpm.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function getLaunchAngleQuality(confidence: number | null): 'high' | 'medium' | 'low' | null {
  if (confidence === null) return null;
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.4) return 'medium';
  return 'low';
}

export function ShotDisplay({ shot, animate = false, simResult = null }: ShotDisplayProps) {
  const { unitSystem } = useUnitPreference();
  const carryRange = useMemo(() => {
    if (!shot) return null;
    return formatCarryRange(shot.carry_range, unitSystem);
  }, [shot, unitSystem]);

  const displayCarry = shot?.carry_spin_adjusted ?? shot?.estimated_carry_yards ?? 0;
  const carrySubtext = shot?.carry_spin_adjusted ? 'spin-adjusted' : carryRange || undefined;

  // Sim result distances are already normalized to yards by the
  // integration layer; no per-sim conversion needed here.
  const simSourceLabel = simResult
    ? SIM_SOURCE_LABELS[simResult.source] ?? simResult.source
    : null;

  if (!shot) {
    return (
      <section
        className="shot-display shot-display--empty"
        aria-labelledby="shot-display-heading"
      >
        <h2 id="shot-display-heading" className="visually-hidden">
          Live shot — waiting for swing
        </h2>
        <div className="shot-display__waiting" aria-hidden="true">
          <div className="golf-ball-indicator">
            <div className="golf-ball-indicator__ball">
              <div className="golf-ball-indicator__dimple" />
              <div className="golf-ball-indicator__dimple" />
              <div className="golf-ball-indicator__dimple" />
            </div>
            <div className="golf-ball-indicator__shadow" />
          </div>
          <p className="shot-display__waiting-text">Ready for your shot</p>
          <p className="shot-display__waiting-hint">Position ball in front of radar</p>
        </div>
      </section>
    );
  }

  const hasSpin = shot.spin_rpm !== null;
  const hasLaunchAngle = shot.launch_angle_vertical !== null;

  return (
    <section
      className={`shot-display ${animate ? 'shot-display--animate' : ''}`}
      aria-labelledby="shot-display-heading"
      aria-live="polite"
    >
      <h2 id="shot-display-heading" className="visually-hidden">
        Live shot data
      </h2>
      <div className="shot-display__layout">
        <div className="shot-display__primary">
          <SpeedGauge
            speedMph={shot.ball_speed_mph}
            label="Ball Speed"
            displayValue={formatSpeed(shot.ball_speed_mph, unitSystem, 1)}
            unit={getSpeedUnit(unitSystem)}
          />
        </div>

        {/*
         * Every metric card always renders with stable id (the `key`
         * prop) so the editable dashboard has a constant set to bind
         * its layout to. Cards backed by data that isn't always
         * present (Club AoA from K-LD7, sim cards from OpenGolfSim)
         * show "—" when their value is missing rather than
         * disappearing.
         *
         * The EditableDashboard wrapper renders the same RGL layout in
         * both view and edit modes — only edit mode lights up drag /
         * resize / outlines, so any change made in edit mode is
         * visible the moment the user exits.
         */}
        <EditableDashboard
          view={DashboardKey.Live}
          cardIds={LIVE_CARD_IDS}
          cardLabels={LIVE_CARD_LABELS}
        >
          <MetricCard
            key="carry"
            value={formatDistance(displayCarry, unitSystem, 0)}
            unit={getDistanceUnit(unitSystem)}
            label="Est. Carry"
            subtext={carrySubtext}
            variant="primary"
          />
          <MetricCard
            key="club_speed"
            value={shot.club_speed_mph ? formatSpeed(shot.club_speed_mph, unitSystem, 1) : '—'}
            unit={shot.club_speed_mph ? getSpeedUnit(unitSystem) : undefined}
            label="Club Speed"
            subtext={shot.smash_factor ? `${shot.smash_factor.toFixed(2)} smash` : undefined}
            variant="secondary"
          />
          <MetricCard
            key="v_launch"
            value={hasLaunchAngle ? shot.launch_angle_vertical!.toFixed(1) : '—'}
            unit={hasLaunchAngle ? '°' : undefined}
            label="V. Launch"
            subtext={hasLaunchAngle ? (shot.angle_source ?? undefined) : undefined}
            variant="secondary"
            confidence={hasLaunchAngle ? getLaunchAngleQuality(shot.launch_angle_confidence) : null}
          />
          <MetricCard
            key="club_aoa"
            value={shot.club_angle_deg !== null ? shot.club_angle_deg.toFixed(1) : '—'}
            unit={shot.club_angle_deg !== null ? '°' : undefined}
            label="Club AoA"
            subtext={shot.club_angle_deg !== null ? 'radar' : undefined}
            variant="secondary"
          />
          <MetricCard
            key="club_path"
            value={
              shot.club_path_deg !== null
                ? (shot.club_path_deg >= 0 ? '+' : '') + shot.club_path_deg.toFixed(1)
                : '—'
            }
            unit={shot.club_path_deg !== null ? '°' : undefined}
            label="Club Path"
            subtext={shot.club_path_deg !== null ? 'radar' : undefined}
            variant="secondary"
          />
          <MetricCard
            key="spin_axis"
            value={
              shot.spin_axis_deg !== null
                ? (shot.spin_axis_deg >= 0 ? '+' : '') + shot.spin_axis_deg.toFixed(1)
                : '—'
            }
            unit={shot.spin_axis_deg !== null ? '°' : undefined}
            label="Spin Axis"
            subtext={
              shot.spin_axis_deg !== null
                ? shot.spin_axis_deg > 2
                  ? 'fade'
                  : shot.spin_axis_deg < -2
                    ? 'draw'
                    : 'straight'
                : undefined
            }
            variant="secondary"
          />
          <MetricCard
            key="h_launch"
            value={
              shot.launch_angle_horizontal !== null
                ? (shot.launch_angle_horizontal >= 0 ? '+' : '') +
                  shot.launch_angle_horizontal.toFixed(1)
                : '—'
            }
            unit={shot.launch_angle_horizontal !== null ? '°' : undefined}
            label="H. Launch"
            subtext={shot.launch_angle_horizontal !== null ? (shot.angle_source ?? undefined) : undefined}
            variant="secondary"
            confidence={
              shot.launch_angle_horizontal !== null
                ? getLaunchAngleQuality(shot.launch_angle_confidence)
                : null
            }
          />
          <MetricCard
            key="spin_rpm"
            value={hasSpin ? formatSpinRpm(shot.spin_rpm!) : '—'}
            unit={hasSpin ? 'rpm' : undefined}
            label="Spin Rate"
            variant="spin"
            confidence={hasSpin ? shot.spin_quality : null}
          />
          <MetricCard
            key="sim_carry"
            value={simResult ? formatDistance(simResult.carry_yards, unitSystem, 0) : '—'}
            unit={simResult ? getDistanceUnit(unitSystem) : undefined}
            label="Sim Carry"
            subtext={simSourceLabel ?? undefined}
            variant="primary"
          />
          <MetricCard
            key="sim_total"
            value={simResult ? formatDistance(simResult.total_yards, unitSystem, 0) : '—'}
            unit={simResult ? getDistanceUnit(unitSystem) : undefined}
            label="Sim Total"
            subtext={
              simResult && simResult.roll_yards !== null && simResult.roll_yards !== undefined
                ? `+${formatDistance(simResult.roll_yards, unitSystem, 0)} ${getDistanceUnit(unitSystem)} roll`
                : undefined
            }
            variant="secondary"
          />
          <MetricCard
            key="sim_lateral"
            value={
              simResult
                ? (simResult.lateral_yards >= 0 ? '+' : '') +
                  formatDistance(simResult.lateral_yards, unitSystem, 1)
                : '—'
            }
            unit={simResult ? getDistanceUnit(unitSystem) : undefined}
            label="Sim Lateral"
            subtext={
              simResult
                ? simResult.lateral_yards > 1
                  ? 'right'
                  : simResult.lateral_yards < -1
                    ? 'left'
                    : 'straight'
                : undefined
            }
            variant="secondary"
          />
          <MetricCard
            key="sim_apex"
            value={simResult ? formatDistance(simResult.max_height_yards, unitSystem, 0) : '—'}
            unit={simResult ? getDistanceUnit(unitSystem) : undefined}
            label="Sim Apex"
            variant="secondary"
          />
        </EditableDashboard>
      </div>
    </section>
  );
}
