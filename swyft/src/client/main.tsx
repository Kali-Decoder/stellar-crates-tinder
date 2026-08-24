import { StrictMode, lazy, Suspense, type ComponentType } from "react";
import { preload } from "react-dom";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import "@fontsource/archivo-black/400.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/instrument-serif/400.css";
import instrumentSerifRegularUrl from "@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url";
import { isMockUi } from "./mock/enabled";
import { MockApp } from "./mock/MockApp";
import { applyStoredTheme } from "./theme";
import { installUiClickSounds } from "./swipe-sounds";
import "./styles.css";

applyStoredTheme();
installUiClickSounds();

preload(instrumentSerifRegularUrl, {
	as: "font",
	crossOrigin: "anonymous",
	type: "font/woff2",
});

/**
 * Live Privy stack is only bundled when VITE_LIVE_UI=true.
 * Default production builds (VITE_MOCK_UI=true) stay mock-only and avoid
 * optional Privy peer deps that break `vite build`.
 */
const LiveRoot: ComponentType | null =
	import.meta.env.VITE_LIVE_UI === "true"
		? lazy(() =>
				import("./LiveRoot").then((mod) => ({ default: mod.LiveRoot })),
			)
		: null;

function Root() {
	if (isMockUi() || !LiveRoot) return <MockApp />;
	return (
		<Suspense
			fallback={
				<main className="loading-state page-loader">
					<span className="loader-ring" />
					<h1>Loading swyft.fun</h1>
				</main>
			}
		>
			<LiveRoot />
		</Suspense>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element is missing");

createRoot(root).render(
	<StrictMode>
		<Root />
		<Analytics />
	</StrictMode>,
);
