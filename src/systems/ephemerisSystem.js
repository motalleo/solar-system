import { EPHEMERIS_RANGE, ORBITAL_ELEMENTS } from '../data/orbitalElements.js';

const DAY_MS = 86_400_000;
// Simulation baseline: one real second advances one simulated day at 1×.
const REAL_SECONDS_PER_SIMULATED_DAY = 1;
const JULIAN_UNIX_EPOCH = 2_440_587.5;
const JULIAN_J2000 = 2_451_545;
const DAYS_PER_CENTURY = 36_525;
const DEG_TO_RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const DEFAULT_TOLERANCE = 1.7453292519943295e-8;
const PLANET_IDS = Object.freeze(Object.keys(ORBITAL_ELEMENTS));
const RANGE_START_MS = Date.parse(EPHEMERIS_RANGE.start);
const RANGE_END_MS = Date.parse(EPHEMERIS_RANGE.end);
const MODES = new Set(['ephemeris', 'simulation']);

function validatedDate(value) {
  if (!(value instanceof Date)) throw new TypeError('Expected a Date instance.');
  const time = value.getTime();
  if (!Number.isFinite(time)) throw new RangeError('Date must be valid.');
  if (time < RANGE_START_MS || time > RANGE_END_MS) {
    throw new RangeError('Ephemeris date must be between 1800 and 2050.');
  }
  return new Date(time);
}

function valueAtCentury([base, rate], centuries) {
  return base + rate * centuries;
}

function orbitalFrame(elements, centuries) {
  const semiMajorAxis = valueAtCentury(elements.a, centuries);
  const eccentricity = valueAtCentury(elements.e, centuries);
  const inclination = valueAtCentury(elements.I, centuries) * DEG_TO_RAD;
  const longitudePerihelion = valueAtCentury(elements.longPeri, centuries) * DEG_TO_RAD;
  const longitudeNode = valueAtCentury(elements.longNode, centuries) * DEG_TO_RAD;
  const argumentPerihelion = longitudePerihelion - longitudeNode;
  return {
    semiMajorAxis,
    eccentricity,
    longitudePerihelion,
    cosArgument: Math.cos(argumentPerihelion),
    sinArgument: Math.sin(argumentPerihelion),
    cosNode: Math.cos(longitudeNode),
    sinNode: Math.sin(longitudeNode),
    cosInclination: Math.cos(inclination),
    sinInclination: Math.sin(inclination),
  };
}

function rotateOrbitalCoordinates(orbitalX, orbitalY, frame) {
  const {
    cosArgument,
    sinArgument,
    cosNode,
    sinNode,
    cosInclination,
    sinInclination,
  } = frame;
  const x = (cosArgument * cosNode - sinArgument * sinNode * cosInclination) * orbitalX
    + (-sinArgument * cosNode - cosArgument * sinNode * cosInclination) * orbitalY;
  const y = (cosArgument * sinNode + sinArgument * cosNode * cosInclination) * orbitalX
    + (-sinArgument * sinNode + cosArgument * cosNode * cosInclination) * orbitalY;
  const z = sinArgument * sinInclination * orbitalX
    + cosArgument * sinInclination * orbitalY;
  return { x, y, z, radiusAU: Math.hypot(x, y, z) };
}

export function toJulianDay(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new RangeError('Julian Day requires a valid Date.');
  }
  return date.getTime() / DAY_MS + JULIAN_UNIX_EPOCH;
}

export function solveKepler(meanAnomalyRad, eccentricity, tolerance = DEFAULT_TOLERANCE) {
  if (!Number.isFinite(meanAnomalyRad)
    || !Number.isFinite(eccentricity)
    || eccentricity < 0
    || eccentricity >= 1
    || !Number.isFinite(tolerance)
    || tolerance <= 0) {
    throw new RangeError('Kepler solver received values outside its supported range.');
  }

  const normalizedMean = ((meanAnomalyRad + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
  const turns = meanAnomalyRad - normalizedMean;
  let eccentricAnomaly = eccentricity < 0.8 ? normalizedMean : Math.PI;

  for (let iteration = 0; iteration < 20; iteration += 1) {
    const residual = eccentricAnomaly
      - eccentricity * Math.sin(eccentricAnomaly)
      - normalizedMean;
    const correction = residual / (1 - eccentricity * Math.cos(eccentricAnomaly));
    eccentricAnomaly -= correction;
    if (Math.abs(correction) <= tolerance) return eccentricAnomaly + turns;
  }

  throw new RangeError('Kepler solver did not converge within 20 iterations.');
}

export function heliocentricPosition(id, date) {
  const elements = ORBITAL_ELEMENTS[id];
  if (!elements) throw new RangeError(`Unknown planet: ${id}`);
  const safeDate = validatedDate(date);
  const centuries = (toJulianDay(safeDate) - JULIAN_J2000) / DAYS_PER_CENTURY;
  const frame = orbitalFrame(elements, centuries);
  const { semiMajorAxis, eccentricity, longitudePerihelion } = frame;
  const longitude = valueAtCentury(elements.L, centuries) * DEG_TO_RAD;
  const meanAnomaly = longitude - longitudePerihelion;
  const eccentricAnomaly = solveKepler(meanAnomaly, eccentricity);
  const orbitalX = semiMajorAxis * (Math.cos(eccentricAnomaly) - eccentricity);
  const orbitalY = semiMajorAxis
    * Math.sqrt(1 - eccentricity ** 2)
    * Math.sin(eccentricAnomaly);
  return rotateOrbitalCoordinates(orbitalX, orbitalY, frame);
}

export function sampleHeliocentricOrbit(id, date, segments = 256) {
  const elements = ORBITAL_ELEMENTS[id];
  if (!elements) throw new RangeError(`Unknown planet: ${id}`);
  const safeDate = validatedDate(date);
  if (!Number.isInteger(segments) || segments < 4) {
    throw new RangeError('Orbit sampling requires at least four integer segments.');
  }
  const centuries = (toJulianDay(safeDate) - JULIAN_J2000) / DAYS_PER_CENTURY;
  const frame = orbitalFrame(elements, centuries);
  const { semiMajorAxis, eccentricity } = frame;
  const minorAxisFactor = Math.sqrt(1 - eccentricity ** 2);
  const points = [];
  for (let index = 0; index <= segments; index += 1) {
    const eccentricAnomaly = index / segments * TWO_PI;
    const orbitalX = semiMajorAxis * (Math.cos(eccentricAnomaly) - eccentricity);
    const orbitalY = semiMajorAxis * minorAxisFactor * Math.sin(eccentricAnomaly);
    points.push(rotateOrbitalCoordinates(orbitalX, orbitalY, frame));
  }
  return points;
}

export function createEphemerisSystem(initialDate = new Date()) {
  let currentDate = validatedDate(initialDate);
  let currentMode = 'ephemeris';

  function setDate(nextDate) {
    currentDate = validatedDate(nextDate);
    return new Date(currentDate);
  }

  function setMode(nextMode) {
    if (!MODES.has(nextMode)) throw new RangeError(`Unsupported ephemeris mode: ${nextMode}`);
    currentMode = nextMode;
    return currentMode;
  }

  function resetToday() {
    const now = Date.now();
    currentDate = new Date(Math.max(RANGE_START_MS, Math.min(RANGE_END_MS, now)));
    return new Date(currentDate);
  }

  function advance(realDelta, multiplier = 1) {
    if (currentMode !== 'simulation') return new Date(currentDate);
    if (!Number.isFinite(realDelta) || !Number.isFinite(multiplier)) {
      throw new RangeError('Simulation advance requires finite values.');
    }
    const simulatedDays = realDelta * multiplier / REAL_SECONDS_PER_SIMULATED_DAY;
    const nextTime = currentDate.getTime() + simulatedDays * DAY_MS;
    currentDate = new Date(Math.max(RANGE_START_MS, Math.min(RANGE_END_MS, nextTime)));
    return new Date(currentDate);
  }

  function getSnapshot() {
    return Object.fromEntries(
      PLANET_IDS.map((id) => [id, heliocentricPosition(id, currentDate)]),
    );
  }

  return {
    setDate,
    setMode,
    resetToday,
    advance,
    getSnapshot,
    get date() {
      return new Date(currentDate);
    },
    get mode() {
      return currentMode;
    },
  };
}
