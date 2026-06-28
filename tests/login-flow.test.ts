import { describe, expect, it } from 'bun:test';
import { normalizeDeviceSession } from '../src/login-flow';

describe('normalizeDeviceSession', () => {
	it('keeps siteUrl when provided by API', () => {
		const session = normalizeDeviceSession({
			siteUrl: 'https://dev.bataitools.com',
			device_code: 'abc',
			user_code: 'ABCD-1234',
			verification_uri: 'https://dev.bataitools.com/handshake/device',
			verification_uri_complete: 'https://dev.bataitools.com/handshake/device?user_code=ABCD-1234',
			expires_in: 900,
			interval: 5,
		});

		expect(session.siteUrl).toBe('https://dev.bataitools.com');
	});

	it('derives siteUrl from verification_uri when API omits siteUrl', () => {
		const session = normalizeDeviceSession({
			device_code: 'abc',
			user_code: 'ABCD-1234',
			verification_uri: 'https://dev.bataitools.com/handshake/device',
			verification_uri_complete: 'https://dev.bataitools.com/handshake/device?user_code=ABCD-1234',
			expires_in: 900,
			interval: 5,
		});

		expect(session.siteUrl).toBe('https://dev.bataitools.com');
	});

	it('throws when verification_uri_complete is missing', () => {
		expect(() =>
			normalizeDeviceSession({
				device_code: 'abc',
				user_code: 'ABCD-1234',
				verification_uri: 'https://dev.bataitools.com/handshake/device',
				verification_uri_complete: '',
				expires_in: 900,
				interval: 5,
			}),
		).toThrow('verification_uri_complete');
	});
});
