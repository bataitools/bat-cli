/**
 * 纯 JavaScript 实现的 SHA-256 和 HMAC-SHA-256
 * 用于在非安全上下文（HTTP + 非 localhost）下替代 window.crypto.subtle
 */

function sha256(ascii: string): string {
	function rightRotate(value: number, amount: number) {
		return (value >>> amount) | (value << (32 - amount));
	}

	const math = Math;
	const maxWord = math.pow(2, 32);
	const result: string[] = [];
	const words: number[] = [];
	let asciiLength = ascii.length * 8;

	let hash = ((sha256 as any).h = (sha256 as any).h || []);
	let k = ((sha256 as any).k = (sha256 as any).k || []);
	let primeCounter = k.length;

	const isComposite: any = {};
	for (let i = 2; primeCounter < 64; i++) {
		if (!isComposite[i]) {
			for (let j = i * i; j < 311; j += i) isComposite[j] = 1;
			hash[primeCounter] = (math.pow(i, 1 / 2) * maxWord) | 0;
			k[primeCounter++] = (math.pow(i, 1 / 3) * maxWord) | 0;
		}
	}

	ascii += '\x80';
	while ((ascii.length % 64) - 56) ascii += '\x00';
	for (let i = 0; i < ascii.length; i++) {
		const j = ascii.charCodeAt(i);
		if (j >> 8) return ''; // only support ascii
		words[i >> 2] |= j << ((3 - (i % 4)) * 8);
	}
	words[words.length] = (asciiLength / maxWord) | 0;
	words[words.length] = asciiLength | 0;

	let v = hash.slice();
	for (let i = 0; i < words.length; i += 16) {
		const w = words.slice(i, i + 16);
		const oldV = v.slice();
		for (let j = 0; j < 64; j++) {
			if (j >= 16) {
				const w15 = w[j - 15],
					w2 = w[j - 2];
				w[j] =
					((rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
						w[j - 7] +
						(rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10)) +
						w[j - 16]) |
					0;
			}
			const s1 = rightRotate(v[4], 6) ^ rightRotate(v[4], 11) ^ rightRotate(v[4], 25);
			const ch = (v[4] & v[5]) ^ (~v[4] & v[6]);
			const temp1 = (v[7] + s1 + ch + k[j] + w[j]) | 0;
			const s0 = rightRotate(v[0], 2) ^ rightRotate(v[0], 13) ^ rightRotate(v[0], 22);
			const maj = (v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]);
			const temp2 = (s0 + maj) | 0;

			v = [(temp1 + temp2) | 0].concat(v);
			v[4] = (v[4] + temp1) | 0;
			v.length = 8;
		}
		for (let j = 0; j < 8; j++) v[j] = (v[j] + oldV[j]) | 0;
	}

	for (let i = 0; i < 8; i++) {
		for (let j = 3; j >= 0; j--) {
			const b = (v[i] >> (j * 8)) & 255;
			result.push((b < 16 ? '0' : '') + b.toString(16));
		}
	}
	return result.join('');
}

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
	}
	return bytes;
}

function stringToBytes(str: string): Uint8Array {
	return new TextEncoder().encode(str);
}

function bytesToString(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => String.fromCharCode(b))
		.join('');
}

export function hmacSha256(key: string, data: string): string {
	const blockSize = 64;
	let keyBytes = stringToBytes(key);

	if (keyBytes.length > blockSize) {
		keyBytes = hexToBytes(sha256(bytesToString(keyBytes)));
	}

	if (keyBytes.length < blockSize) {
		const newKey = new Uint8Array(blockSize);
		newKey.set(keyBytes);
		keyBytes = newKey;
	}

	const ipad = new Uint8Array(blockSize);
	const opad = new Uint8Array(blockSize);
	for (let i = 0; i < blockSize; i++) {
		ipad[i] = keyBytes[i] ^ 0x36;
		opad[i] = keyBytes[i] ^ 0x5c;
	}

	const innerHash = hexToBytes(sha256(bytesToString(ipad) + data));
	return sha256(bytesToString(opad) + bytesToString(innerHash));
}

export function hashSha256(data: string): string {
	return sha256(data);
}
