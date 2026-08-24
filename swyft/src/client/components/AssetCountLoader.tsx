import { useEffect, useState } from "react";
import { STELLAR_SUPPORTED_ASSET_COUNT } from "../stellar/config";

/**
 * Centered feed loader that counts up to the supported Stellar vault asset total.
 */
export function AssetCountLoader({
	title = "Loading assets",
	subtitle = "Pulling the full Stellar vault universe…",
	target = STELLAR_SUPPORTED_ASSET_COUNT,
}: {
	title?: string;
	subtitle?: string;
	target?: number;
}) {
	const [count, setCount] = useState(0);
	const safeTarget = Math.max(1, target);
	const progress = Math.min(1, count / safeTarget);

	useEffect(() => {
		setCount(0);
		let current = 0;
		let frame = 0;
		const tickMs = Math.max(28, Math.min(70, Math.round(1600 / safeTarget)));

		const id = window.setInterval(() => {
			current += 1;
			frame += 1;
			// Occasional +1 jumps so it doesn't feel strictly linear.
			if (frame % 7 === 0 && current < safeTarget - 1) current += 1;
			if (current >= safeTarget) {
				current = safeTarget;
				setCount(current);
				window.clearInterval(id);
				return;
			}
			setCount(current);
		}, tickMs);

		return () => window.clearInterval(id);
	}, [safeTarget]);

	return (
		<div
			className="loading-state page-loader asset-count-loader"
			role="status"
			aria-live="polite"
			aria-busy="true"
			aria-label={`Loading assets ${count} of ${safeTarget}`}
		>
			<div className="asset-count-ring" style={{ ["--progress" as string]: String(progress) }}>
				<strong className="asset-count-value">{count}</strong>
				<small>of {safeTarget}</small>
			</div>
			<h2>{title}</h2>
			<p>
				{subtitle}
				<br />
				<span className="asset-count-caption">
					{count}/{safeTarget} supported assets
				</span>
			</p>
		</div>
	);
}
