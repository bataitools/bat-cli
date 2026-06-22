export interface User {
	id: string;
	username: string;
	subscription_tier: string;
	subscription_expires_at: string | null;
}

export interface AccessTokenPayload extends User {
	iat: number; // issued at (Unix timestamp)
	exp: number; // expiry (Unix timestamp, iat + 3600)
}

export interface RefreshTokenPayload {
	id: string; // user UUID
	token_id: string; // matches refresh_tokens.id for revocation
	iat: number;
	exp: number; // iat + 31536000 (365 days)
}

export const AUTH_KEYS = {
	ACCESS_TOKEN: 'grammar_access_token',
	REFRESH_TOKEN: 'grammar_refresh_token',
	USER_INFO: 'grammar_user_info',
};
