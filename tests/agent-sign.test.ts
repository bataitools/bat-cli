import { describe, expect, it } from 'bun:test';
import { calculateAgentSubmitSignature } from '../src/shared';
import { signAgentRequest } from '../src/agent-sign';

describe('signAgentRequest', () => {
	it('matches server payload format for empty POST body', async () => {
		const path = '/bat/agent/device/code';
		const headers = await signAgentRequest('POST', path, '');
		const timestamp = Number(headers['x-bat-timestamp']);
		const expected = await calculateAgentSubmitSignature(`POST:${path}:`, timestamp);
		expect(headers['x-bat-signature']).toBe(expected);
	});

	it('includes JSON body in signed payload for device token poll', async () => {
		const path = '/bat/agent/device/token';
		const bodyText = JSON.stringify({ device_code: 'abc123' });
		const headers = await signAgentRequest('POST', path, bodyText);
		const timestamp = Number(headers['x-bat-timestamp']);
		const expected = await calculateAgentSubmitSignature(`POST:${path}:${bodyText}`, timestamp);
		expect(headers['x-bat-signature']).toBe(expected);
	});
});
