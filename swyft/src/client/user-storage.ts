export interface SwyftUser {
	id: string;
	wallet: string;
	username: string;
	createdAt: string;
	updatedAt: string;
}

const USERS_KEY = "swyft:users:v1";

const ADJECTIVES = [
	"swift",
	"stellar",
	"bright",
	"quiet",
	"lunar",
	"solar",
	"coral",
	"amber",
	"jade",
	"nova",
	"orbit",
	"pulse",
];

const NOUNS = [
	"otter",
	"comet",
	"vault",
	"kite",
	"reef",
	"sparrow",
	"pixel",
	"beacon",
	"drift",
	"harbor",
	"flint",
	"willow",
];

function browserStorage(): Storage | undefined {
	return (globalThis as { localStorage?: Storage }).localStorage;
}

function readAll(storage = browserStorage()): Record<string, SwyftUser> {
	if (!storage) return {};
	try {
		const raw = storage.getItem(USERS_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Record<string, SwyftUser>;
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

function writeAll(
	users: Record<string, SwyftUser>,
	storage = browserStorage(),
) {
	storage?.setItem(USERS_KEY, JSON.stringify(users));
}

function pickUsername(seed: string) {
	let hash = 0;
	for (let i = 0; i < seed.length; i += 1) {
		hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
	}
	const adjective = ADJECTIVES[hash % ADJECTIVES.length];
	const noun = NOUNS[(hash >>> 8) % NOUNS.length];
	const suffix = String(hash % 1000).padStart(3, "0");
	return `${adjective}_${noun}_${suffix}`;
}

export function getUserByWallet(
	wallet: string,
	storage = browserStorage(),
): SwyftUser | undefined {
	if (!wallet) return;
	return readAll(storage)[wallet];
}

/** Create a local user for a wallet if one does not already exist. */
export function ensureUserForWallet(
	wallet: string,
	storage = browserStorage(),
): SwyftUser | undefined {
	if (!wallet || !storage) return;
	const users = readAll(storage);
	const existing = users[wallet];
	if (existing) {
		const touched: SwyftUser = {
			...existing,
			updatedAt: new Date().toISOString(),
		};
		users[wallet] = touched;
		writeAll(users, storage);
		return touched;
	}

	const now = new Date().toISOString();
	const created: SwyftUser = {
		id: `user_${wallet.slice(0, 8)}_${Date.now().toString(36)}`,
		wallet,
		username: pickUsername(wallet),
		createdAt: now,
		updatedAt: now,
	};
	users[wallet] = created;
	writeAll(users, storage);
	return created;
}

export function updateUsername(
	wallet: string,
	username: string,
	storage = browserStorage(),
): SwyftUser | undefined {
	if (!wallet || !storage) return;
	const users = readAll(storage);
	const existing = users[wallet];
	if (!existing) return;
	const next: SwyftUser = {
		...existing,
		username: username.trim() || existing.username,
		updatedAt: new Date().toISOString(),
	};
	users[wallet] = next;
	writeAll(users, storage);
	return next;
}
