import { describe, expect, it } from 'bun:test';
import {
	AgentApiError,
	formatAgentApiError,
	formatCliError,
	isAgentApiErrorCode,
	shortCliErrorLabel,
} from '../src/api-error';

describe('Agent API error formatting', () => {
	it('formats known PRODUCT_UPDATE_FORBIDDEN with title, summary and steps', () => {
		const error = AgentApiError.fromResponse(400, {
			success: false,
			errorCode: 'PRODUCT_UPDATE_FORBIDDEN',
			errorMsg: 'Guest accounts can only update unowned products they submitted.',
		});
		const text = formatAgentApiError(error);

		expect(text).toContain('✗ Cannot update this product (PRODUCT_UPDATE_FORBIDDEN)');
		expect(text).toContain('Guest accounts can only update unowned products');
		expect(text).toContain('What to do:');
		expect(text).toContain('1. Run `bat-cli logout`');
		expect(text).toContain('2. Run `bat-cli login`');
		expect(text).not.toContain('bataitools.com');
	});

	it('falls back to server message for unknown error codes', () => {
		const error = AgentApiError.fromResponse(400, {
			success: false,
			errorCode: 'CUSTOM_AGENT_ERROR',
			errorMsg: 'Something specific happened.',
		});
		const text = formatAgentApiError(error);

		expect(text).toContain('Request failed (CUSTOM_AGENT_ERROR)');
		expect(text).toContain('Something specific happened.');
	});

	it('matches error codes via isAgentApiErrorCode', () => {
		const error = AgentApiError.fromResponse(400, {
			success: false,
			errorCode: 'AUTHORIZATION_PENDING',
			errorMsg: 'Waiting for user authorization',
		});

		expect(isAgentApiErrorCode(error, 'AUTHORIZATION_PENDING')).toBe(true);
		expect(isAgentApiErrorCode(error, 'SLOW_DOWN')).toBe(false);
	});

	it('provides short label and full formatted text helpers', () => {
		const error = AgentApiError.fromResponse(400, {
			success: false,
			errorCode: 'PRODUCT_UPDATE_FORBIDDEN',
			errorMsg: 'Guest accounts can only update unowned products they submitted.',
		});

		expect(shortCliErrorLabel(error)).toBe('Cannot update this product (PRODUCT_UPDATE_FORBIDDEN)');
		expect(formatCliError(error)).toBe(formatAgentApiError(error));
	});

	it('maps legacy 401 Unauthorized to invalid API key guidance', () => {
		const error = AgentApiError.fromResponse(401, {
			success: false,
			errorCode: '401',
			errorMsg: 'Unauthorized',
		});
		expect(error.presentation.title).toBe('Invalid API key');
		expect(error.presentation.steps?.length).toBeGreaterThan(0);
	});
});
