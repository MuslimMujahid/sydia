type GoogleMeetDetails = {
  googleMeetUrl: string | null;
  googleMeetStatus: 'pending' | 'success' | 'failure' | null;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Conference metadata stays in the existing provider snapshot. */
export function googleMeetDetails(resource: unknown): GoogleMeetDetails {
  if (!record(resource)) return { googleMeetUrl: null, googleMeetStatus: null };
  const conference = resource.conferenceData;
  const points = record(conference) ? conference.entryPoints : undefined;
  const video = Array.isArray(points)
    ? (points.find(
        (point: unknown) => record(point) && point.entryPointType === 'video',
      ) as unknown)
    : undefined;

  const candidate = record(video) ? video.uri : resource.hangoutLink;
  // Only expose Google's Meet links as actionable URLs.
  const googleMeetUrl =
    typeof candidate === 'string' &&
    /^https:\/\/meet\.google\.com\/[a-z0-9-]+$/i.test(candidate)
      ? candidate
      : null;

  const request = record(conference) ? conference.createRequest : undefined;
  const status =
    record(request) && record(request.status)
      ? request.status.statusCode
      : undefined;

  return {
    googleMeetUrl,
    googleMeetStatus: googleMeetUrl
      ? 'success'
      : status === 'pending' || status === 'success' || status === 'failure'
        ? status
        : null,
  };
}
