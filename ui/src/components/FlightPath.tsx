import { useMemo } from 'react';
import type { Trajectory } from '../types/shot';
import { useUnitPreference } from '../state/useUnitPreference';
import { formatDistance, formatSpeed, getDistanceUnit, getSpeedUnit } from '../utils/units';
import {
  PADDING,
  SIDE_VIEW_HEIGHT,
  TOP_VIEW_HEIGHT,
  VIEW_WIDTH,
  computeGeometry,
  distanceTicks,
} from './flightPathGeometry';
import './FlightPath.css';

/**
 * Two-panel flight path: a side elevation showing height against distance, and
 * a top-down view showing curvature against distance. Projection maths lives in
 * `flightPathGeometry` so it can be tested without a DOM.
 *
 * The trajectory comes from the server's drag + Magnus simulation. When it was
 * built on a club-average spin rate rather than a measured one, the panel says
 * so — an illustrated flight and a measured one should not look identical.
 */

interface FlightPathProps {
  trajectory: Trajectory;
}

export function FlightPath({ trajectory }: FlightPathProps) {
  const { unitSystem } = useUnitPreference();
  const { points } = trajectory;

  const geometry = useMemo(() => computeGeometry(points), [points]);

  const ticks = distanceTicks(geometry.maxDistance);
  const distanceUnit = getDistanceUnit(unitSystem);
  const lateral = trajectory.lateral_yards;
  const shapeLabel = lateral > 2 ? 'Fade' : lateral < -2 ? 'Draw' : 'Straight';
  const sideLabel = `${formatDistance(Math.abs(lateral), unitSystem)} ${distanceUnit} ${
    lateral >= 0 ? 'right' : 'left'
  }`;
  const spinAssumed = trajectory.spin_source === 'club_typical';

  return (
    <div className="flight-path">
      <div className="flight-path__header">
        <h3 className="flight-path__title">Flight Path</h3>
        {spinAssumed && (
          <span className="flight-path__badge" title="Simulated using a club-average spin rate">
            Estimated spin
          </span>
        )}
      </div>

      <figure className="flight-path__panel">
        <figcaption className="flight-path__caption">
          Side view
          <span className="flight-path__caption-detail">
            apex {formatDistance(trajectory.apex_yards, unitSystem)} {distanceUnit}
          </span>
        </figcaption>
        <svg
          className="flight-path__svg"
          viewBox={`0 0 ${VIEW_WIDTH} ${SIDE_VIEW_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Side view of ball flight: ${formatDistance(
            trajectory.carry_yards,
            unitSystem
          )} ${distanceUnit} carry, ${formatDistance(trajectory.apex_yards, unitSystem)} ${distanceUnit} apex`}
        >
          {ticks.map((yards) => (
            <g key={yards}>
              <line
                className="flight-path__gridline"
                x1={geometry.sideScale.x(yards)}
                y1={PADDING.top}
                x2={geometry.sideScale.x(yards)}
                y2={geometry.groundY}
              />
              <text
                className="flight-path__tick"
                x={geometry.sideScale.x(yards)}
                y={geometry.groundY + 18}
                textAnchor="middle"
              >
                {formatDistance(yards, unitSystem)}
              </text>
            </g>
          ))}

          <line
            className="flight-path__ground"
            x1={PADDING.left}
            y1={geometry.groundY}
            x2={VIEW_WIDTH - PADDING.right}
            y2={geometry.groundY}
          />

          <path className="flight-path__trace" d={geometry.sidePath} />

          <circle
            className="flight-path__apex-marker"
            cx={geometry.sideScale.x(geometry.apex.x)}
            cy={geometry.sideScale.y(geometry.apex.z)}
            r={4}
          />
          <circle
            className="flight-path__landing-marker"
            cx={geometry.sideScale.x(trajectory.carry_yards)}
            cy={geometry.groundY}
            r={5}
          />

          <text className="flight-path__tick" x={VIEW_WIDTH - PADDING.right} y={geometry.groundY + 18} textAnchor="end">
            {distanceUnit}
          </text>
        </svg>
      </figure>

      <figure className="flight-path__panel">
        <figcaption className="flight-path__caption">
          Top view
          <span className="flight-path__caption-detail">
            {shapeLabel} {sideLabel}
          </span>
        </figcaption>
        <svg
          className="flight-path__svg"
          viewBox={`0 0 ${VIEW_WIDTH} ${TOP_VIEW_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Top view of ball flight: ${shapeLabel.toLowerCase()}, finishing ${sideLabel} of target`}
        >
          {ticks.map((yards) => (
            <line
              key={yards}
              className="flight-path__gridline"
              x1={geometry.topScale.x(yards)}
              y1={PADDING.top}
              x2={geometry.topScale.x(yards)}
              y2={TOP_VIEW_HEIGHT - PADDING.bottom}
            />
          ))}

          <line
            className="flight-path__target-line"
            x1={PADDING.left}
            y1={geometry.topCenter}
            x2={VIEW_WIDTH - PADDING.right}
            y2={geometry.topCenter}
          />

          <path className="flight-path__trace" d={geometry.topPath} />

          <circle
            className="flight-path__landing-marker"
            cx={geometry.topScale.x(trajectory.carry_yards)}
            cy={geometry.topScale.y(lateral)}
            r={5}
          />

          <text className="flight-path__axis-label" x={PADDING.left - 10} y={geometry.topCenter + 4} textAnchor="end">
            0
          </text>
        </svg>
      </figure>

      <dl className="flight-path__metrics">
        <div className="flight-path__metric">
          <dt>Carry</dt>
          <dd>
            {formatDistance(trajectory.carry_yards, unitSystem)}
            <span className="flight-path__unit">{distanceUnit}</span>
          </dd>
        </div>
        <div className="flight-path__metric">
          <dt>Total</dt>
          <dd>
            {formatDistance(trajectory.total_yards, unitSystem)}
            <span className="flight-path__unit">{distanceUnit}</span>
          </dd>
        </div>
        <div className="flight-path__metric">
          <dt>Apex</dt>
          <dd>
            {formatDistance(trajectory.apex_yards, unitSystem)}
            <span className="flight-path__unit">{distanceUnit}</span>
          </dd>
        </div>
        <div className="flight-path__metric">
          <dt>Side</dt>
          <dd>
            {lateral >= 0 ? 'R' : 'L'} {formatDistance(Math.abs(lateral), unitSystem)}
            <span className="flight-path__unit">{distanceUnit}</span>
          </dd>
        </div>
        <div className="flight-path__metric">
          <dt>Descent</dt>
          <dd>
            {trajectory.landing_angle_deg.toFixed(0)}
            <span className="flight-path__unit">°</span>
          </dd>
        </div>
        <div className="flight-path__metric">
          <dt>Hang time</dt>
          <dd>
            {trajectory.flight_time_s.toFixed(1)}
            <span className="flight-path__unit">s</span>
          </dd>
        </div>
        <div className="flight-path__metric">
          <dt>Landing</dt>
          <dd>
            {formatSpeed(trajectory.landing_speed_mph, unitSystem, 0)}
            <span className="flight-path__unit">{getSpeedUnit(unitSystem)}</span>
          </dd>
        </div>
      </dl>

      <p className="flight-path__footnote">
        Simulated from this shot&rsquo;s launch conditions. Total includes a rough rollout estimate that ignores surface
        firmness and slope.
      </p>
    </div>
  );
}
