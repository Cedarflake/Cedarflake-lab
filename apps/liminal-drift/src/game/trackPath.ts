export function resolveTrackCenter(distance: number) {
  return Math.sin(distance * 0.0148) * 4.2 + Math.sin(distance * 0.0062 + 1.2) * 2
}

export function resolveTrackHeading(distance: number) {
  const lookBehind = resolveTrackCenter(distance - 12)
  const lookAhead = resolveTrackCenter(distance + 12)

  return Math.atan2(lookAhead - lookBehind, 24)
}

export function resolveRelativeTrackCenter(distance: number, originDistance: number) {
  return resolveTrackCenter(distance) - resolveTrackCenter(originDistance)
}

export function resolveRelativeTrackPose(
  distance: number,
  originDistance: number,
  zAnchor: number,
) {
  const heading = resolveTrackHeading(distance)

  return {
    heading,
    x: resolveRelativeTrackCenter(distance, originDistance),
    z: -(distance - originDistance) + zAnchor,
  }
}

export function resolveTrackLaneOffset(lane: number, heading: number, laneWidth: number) {
  return resolveTrackLateralOffset(lane * laneWidth, heading)
}

export function resolveTrackLateralOffset(offset: number, heading: number) {
  return {
    x: offset * Math.cos(heading),
    z: -offset * Math.sin(heading),
  }
}
