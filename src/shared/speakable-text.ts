export type SpeakableSegment = {
	value: string;
	speakable: boolean;
};

const SPEAKABLE_TOKEN_RE = /[A-Za-z]+(?:'[A-Za-z]+)?|\d+(?:\.\d+)?/g;

const IS_SPEAKABLE_RE = /^[A-Za-z]+(?:'[A-Za-z]+)?$|^\d+(?:\.\d+)?$/;

/** 将题干拆成可点读（英文/数字）与普通文本片段 */
export function splitSpeakableText(text: string): SpeakableSegment[] {
	if (!text) return [];

	const parts = text.split(SPEAKABLE_TOKEN_RE);
	const tokens = text.match(SPEAKABLE_TOKEN_RE) ?? [];

	const segments: SpeakableSegment[] = [];
	for (let i = 0; i < parts.length; i++) {
		if (parts[i]) {
			segments.push({ value: parts[i], speakable: false });
		}
		if (i < tokens.length) {
			const token = tokens[i];
			segments.push({
				value: token,
				speakable: IS_SPEAKABLE_RE.test(token),
			});
		}
	}

	return segments.length > 0 ? segments : [{ value: text, speakable: false }];
}
