import { expect, test } from '@jest/globals';
import { googleMeetDetails } from './google-meet.js';

test('extracts the Google Meet video entry point from the provider snapshot', () => {
  expect(
    googleMeetDetails({
      conferenceData: {
        entryPoints: [
          { entryPointType: 'phone', uri: 'tel:+1234' },
          {
            entryPointType: 'video',
            uri: 'https://meet.google.com/abc-defg-hij',
          },
        ],
      },
    }),
  ).toEqual({
    googleMeetUrl: 'https://meet.google.com/abc-defg-hij',
    googleMeetStatus: 'success',
  });
});

test('exposes a pending asynchronous conference request', () => {
  expect(
    googleMeetDetails({
      conferenceData: { createRequest: { status: { statusCode: 'pending' } } },
    }),
  ).toEqual({ googleMeetUrl: null, googleMeetStatus: 'pending' });
});

test('exposes a failed conference request so the editor can offer a retry', () => {
  expect(
    googleMeetDetails({
      conferenceData: { createRequest: { status: { statusCode: 'failure' } } },
    }),
  ).toEqual({ googleMeetUrl: null, googleMeetStatus: 'failure' });
});

test('does not expose a non-Meet URL as a Google Meet link', () => {
  expect(
    googleMeetDetails({ hangoutLink: 'https://untrusted.test/meeting' })
      .googleMeetUrl,
  ).toBeNull();
});
