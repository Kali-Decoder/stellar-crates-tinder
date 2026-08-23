const LICENSE_KEY = "swyft:license-accepted:v1";
export const LICENSE_VERSION = "1";

function browserStorage(): Storage | undefined {
	return (globalThis as { localStorage?: Storage }).localStorage;
}

export function hasAcceptedLicense(storage = browserStorage()): boolean {
	if (!storage) return false;
	try {
		const raw = storage.getItem(LICENSE_KEY);
		if (!raw) return false;
		const parsed = JSON.parse(raw) as { version?: string; acceptedAt?: string };
		return parsed?.version === LICENSE_VERSION && Boolean(parsed.acceptedAt);
	} catch {
		return false;
	}
}

export function acceptLicense(storage = browserStorage()) {
	storage?.setItem(
		LICENSE_KEY,
		JSON.stringify({
			version: LICENSE_VERSION,
			acceptedAt: new Date().toISOString(),
		}),
	);
}
