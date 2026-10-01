/** Rendering coordinates for the educational flight model; distances are metres. */
export const EARTH_RADIUS = 6371000;

const LAUNCH_MOUNT_HEIGHT = 3.2;
const LANDING_ROOT_HEIGHT = 0.95;
const RETURN_START = 250;
const TOUCHDOWN_TIME = 480;

function globePose(altitude, downrange, pitch) {
  const arc = downrange / EARTH_RADIUS;
  const radius = EARTH_RADIUS + altitude;
  return {
    x: radius * Math.sin(arc),
    y: radius * Math.cos(arc) - EARTH_RADIUS + LAUNCH_MOUNT_HEIGHT,
    z: 0,
    // The model's +Y axis follows local vertical plus the requested pitch.
    rotation: -(arc + pitch),
  };
}

function smoothstep(value) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

/**
 * Map a sampleFlight state to world poses without depending on renderer objects.
 * The booster landing correction is continuous in time, independent of landed.
 * Its final root height allows the model's deployed legs to contact the pad.
 */
export function flightPose(state) {
  const vehicle = globePose(state.altitude, state.downrange, state.pitch);
  const booster = globePose(state.booster.altitude, state.booster.downrange, state.booster.pitch);
  // Older Falcon 9 samples omit hasRecovery; retain their original landing pose.
  // Explicitly expendable stages must remain on their unshifted flight track.
  const landingBlend = state.hasRecovery === false ? 0
    : smoothstep((state.time - RETURN_START) / (TOUCHDOWN_TIME - RETURN_START));
  booster.x -= 350 * landingBlend;
  booster.z += 200 * landingBlend;
  booster.y += (LANDING_ROOT_HEIGHT - LAUNCH_MOUNT_HEIGHT) * landingBlend;
  return { vehicle, booster };
}
