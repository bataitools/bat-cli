import { describe, expect, it, mock } from 'bun:test';
import { assertFormalApiKeyFormat, verifyFormalApiKey } from '../src/verify-api-key';

describe('verifyFormalApiKey', () => {
	it('rejects keys without bat_ prefix', () => {
		expect(() => assertFormalApiKeyFormat('bat-abc')).toThrow('bat_');
		expect(() => assertFormalApiKeyFormat('short')).toThrow('bat_');
	});

	it('accepts bat_ prefix for format check', () => {
		expect(() => assertFormalApiKeyFormat('bat_0123456789abcdef')).not.toThrow();
	});

	it('throws when whoami returns unauthorized', async () => {
		const fetchMock = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						success: false,
						errorCode: 'INVALID_API_KEY',
						errorMsg: 'The API key does not exist, was revoked, or is incorrect.',
					}),
					{ status: 401 },
				),
			),
		);
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchMock as typeof fetch;

		try {
			await expect(verifyFormalApiKey('bat_0123456789abcdef', 'https://api-dev.bataitools.com')).rejects.toThrow(
				'Invalid API key',
			);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('rejects guest API keys for formal login', async () => {
		const fetchMock = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						success: true,
						data: { userId: 1, accountType: 'guest' },
					}),
					{ status: 200 },
				),
			),
		);
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchMock as typeof fetch;

		try {
			await expect(verifyFormalApiKey('bat_0123456789abcdef', 'https://api-dev.bataitools.com')).rejects.toThrow(
				'guest API key',
			);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('returns whoami when API key is valid', async () => {
		const fetchMock = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						success: true,
						data: { userId: 42, email: 'dev@example.com', accountType: 'formal' },
					}),
					{ status: 200 },
				),
			),
		);
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchMock as typeof fetch;

		try {
			const whoami = await verifyFormalApiKey('bat_0123456789abcdef', 'https://api-dev.bataitools.com');
			expect(whoami.userId).toBe(42);
			expect(whoami.email).toBe('dev@example.com');
			expect(whoami.accountType).toBe('formal');
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
