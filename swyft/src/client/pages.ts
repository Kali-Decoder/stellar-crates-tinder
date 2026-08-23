/** URL paths for each app screen (pages). */
export const APP_PATHS = {
	landing: "/",
	onboarding: "/onboarding",
	basket: "/basket",
	review: "/review",
	portfolio: "/portfolio",
	activity: "/activity",
	account: "/account",
	docs: "/docs",
} as const;

export type AppPage = keyof typeof APP_PATHS;

export type ShellView = "week" | "positions" | "receipts" | "account" | "docs";

export function pathForPage(page: AppPage): string {
	return APP_PATHS[page];
}

export function pageFromPath(pathname: string): AppPage {
	const normalized =
		pathname.length > 1 && pathname.endsWith("/")
			? pathname.slice(0, -1)
			: pathname;
	switch (normalized) {
		case APP_PATHS.onboarding:
			return "onboarding";
		case APP_PATHS.basket:
			return "basket";
		case APP_PATHS.review:
			return "review";
		case APP_PATHS.portfolio:
			return "portfolio";
		case APP_PATHS.activity:
			return "activity";
		case APP_PATHS.account:
			return "account";
		case APP_PATHS.docs:
			return "docs";
		default:
			return "landing";
	}
}

export function shellViewForPage(page: AppPage): ShellView {
	switch (page) {
		case "portfolio":
			return "positions";
		case "activity":
			return "receipts";
		case "account":
			return "account";
		case "docs":
			return "docs";
		default:
			return "week";
	}
}

export function pageForShellView(view: ShellView): AppPage {
	switch (view) {
		case "positions":
			return "portfolio";
		case "receipts":
			return "activity";
		case "account":
			return "account";
		case "docs":
			return "docs";
		default:
			return "basket";
	}
}
