/** Resolve API paths for local Vite proxy or production `VITE_API_BASE_URL`. */
export function apiUrl(path: string): string {
	const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
	const normalized = path.startsWith("/") ? path : `/${path}`;
	return base ? `${base}${normalized}` : normalized;
}
