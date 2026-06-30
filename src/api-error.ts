export interface AgentApiEnvelope<T = unknown> {
	success: boolean;
	errorCode?: string;
	errorMsg?: string;
	data?: T;
}

export interface AgentErrorPresentation {
	title: string;
	summary: string;
	steps?: string[];
}

interface AgentErrorDefinition {
	title: string;
	summary: string;
	steps?: string[];
}

/** Agent API 已知错误码 → CLI 友好展示（errorCode 由后端返回，文案由 CLI 维护） */
const AGENT_ERROR_CATALOG: Record<string, AgentErrorDefinition> = {
	NO_CHANGES_DETECTED: {
		title: 'No changes detected',
		summary: 'The submitted content is identical to the listed product information.',
		steps: [
			'Modify base.json or i18n translation files in your submit directory to update the agent',
			'Make sure you have saved the files before submitting again',
		],
	},
	PRODUCT_UPDATE_FORBIDDEN: {
		title: 'Cannot update this product',
		summary: 'Guest accounts can only update unowned products they submitted in the same guest session.',
		steps: [
			'Run `bat-cli logout`',
			'Run `bat-cli login` and sign in with your registered BAT account',
			'Run your submit command again',
		],
	},
	PRODUCT_OWNERSHIP_MISMATCH: {
		title: 'Product has an owner',
		summary: 'Only the verified product owner can update this listing.',
		steps: [
			'Run `bat-cli logout`',
			'Run `bat-cli login` with the owner account',
			'Or claim product ownership on the BAT website, then retry',
		],
	},
	PRODUCT_ALREADY_EXISTS: {
		title: 'Product already listed',
		summary: 'This website is already in the BAT directory. New submissions are not allowed.',
		steps: [
			'Use the update flow to refresh existing product information',
			'Ensure you are logged in with an account allowed to update this product',
		],
	},
	SUBMIT_LOCKED: {
		title: 'Submission is locked',
		summary: 'This submission is under review or already published and cannot be edited.',
		steps: ['Wait for review to complete, or create a new update submission from the website'],
	},
	PRODUCT_NOT_FOUND: {
		title: 'Product not found',
		summary: 'The product you are trying to update does not exist or was removed.',
	},
	SUBMIT_CREATE_FAILED: {
		title: 'Could not create submission',
		summary: 'The server failed to create a submit draft. Please retry in a moment.',
	},
	CONTENT_SAFETY_VIOLATION: {
		title: 'Content rejected',
		summary: 'Submission content failed safety checks. Review your text and try again.',
	},
	AUTO_LOGIN_FAILED: {
		title: 'Guest login failed',
		summary: 'Could not create a guest account. Check your network and API URL.',
		steps: ['Verify BAT_API_URL or run with `--dev`', 'Run `bat-cli login guest` again'],
	},
	INVALID_API_KEY: {
		title: 'Invalid API key',
		summary: 'This API key does not exist, was revoked, or is incorrect.',
		steps: [
			'Copy a current API key from your BAT account settings',
			'Run `bat-cli login` again with the correct key',
		],
	},
};

export class AgentApiError extends Error {
	readonly code: string;
	readonly status: number;
	readonly serverMessage?: string;
	readonly presentation: AgentErrorPresentation;

	constructor(options: { code: string; status: number; serverMessage?: string }) {
		const presentation = resolveAgentErrorPresentation(options.code, options.serverMessage);
		super(presentation.title);
		this.name = 'AgentApiError';
		this.code = options.code;
		this.status = options.status;
		this.serverMessage = options.serverMessage;
		this.presentation = presentation;
	}

	static fromResponse(status: number, body: Partial<AgentApiEnvelope>): AgentApiError {
		return new AgentApiError({
			code: body.errorCode?.trim() || 'REQUEST_FAILED',
			status,
			serverMessage: body.errorMsg?.trim() || undefined,
		});
	}
}

function resolveAgentErrorPresentation(code: string, serverMessage?: string): AgentErrorPresentation {
	const known = AGENT_ERROR_CATALOG[code];
	if (known) {
		if (serverMessage?.trim()) {
			return {
				...known,
				summary: serverMessage.trim(),
			};
		}
		return known;
	}
	if (code === '401' && serverMessage === 'Unauthorized') {
		return AGENT_ERROR_CATALOG.INVALID_API_KEY!;
	}
	return {
		title: 'Request failed',
		summary: serverMessage ?? `Unexpected API error (${code}).`,
	};
}

export function throwAgentApiError(status: number, body: Partial<AgentApiEnvelope>): never {
	throw AgentApiError.fromResponse(status, body);
}

export function isAgentApiErrorCode(error: unknown, code: string): boolean {
	return error instanceof AgentApiError && error.code === code;
}

export function formatAgentApiError(error: AgentApiError): string {
	const lines: string[] = [];
	lines.push(`✗ ${error.presentation.title} (${error.code})`);
	lines.push('');
	lines.push(error.presentation.summary);
	if (error.presentation.steps?.length) {
		lines.push('');
		lines.push('What to do:');
		for (let i = 0; i < error.presentation.steps.length; i++) {
			lines.push(`  ${i + 1}. ${error.presentation.steps[i]}`);
		}
	}
	return lines.join('\n');
}

export function formatCliError(error: unknown): string {
	if (error instanceof AgentApiError) {
		return formatAgentApiError(error);
	}
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

export function printCliError(error: unknown): void {
	if (error instanceof AgentApiError) {
		console.error(formatAgentApiError(error));
		return;
	}
	if (error instanceof Error) {
		console.error(`[bat-cli] error: ${error.message}`);
		return;
	}
	console.error('[bat-cli] error:', error);
}

export function shortCliErrorLabel(error: unknown): string {
	if (error instanceof AgentApiError) {
		return `${error.presentation.title} (${error.code})`;
	}
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

export function printIndentedCliError(error: unknown, indent = '  '): void {
	for (const line of formatCliError(error).split('\n')) {
		console.error(`${indent}${line}`);
	}
}
