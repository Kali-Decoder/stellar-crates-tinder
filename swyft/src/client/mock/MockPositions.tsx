import { HandCoins, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import type { Candidate } from "../../domain/schemas";
import { api } from "../api";
import { AssetMark } from "../components/AssetMark";

const usdFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	maximumFractionDigits: 2,
});

/** Stellar-only portfolio surface for the mock UI. */
export function MockPositions({
	candidates,
	wallet,
}: {
	candidates: Candidate[];
	wallet: string;
}) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [rows, setRows] = useState<
		Array<{
			candidate: Candidate;
			balanceBaseUnits: string;
		}>
	>([]);
	const [status, setStatus] = useState<Record<string, string>>({});

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError("");
		void api
			.robinhoodPortfolio(wallet)
			.then((portfolio) => {
				if (cancelled) return;
				const byId = new Map(
					candidates.map((candidate) => [candidate.assetId, candidate]),
				);
				setRows(
					portfolio.tokens.flatMap((token) => {
						const known = byId.get(token.assetId);
						if (!known) return [];
						return [
							{
								candidate: {
									...known,
									marketPriceUsd: token.priceUsd ?? known.marketPriceUsd,
								},
								balanceBaseUnits: token.balanceBaseUnits,
							},
						];
					}),
				);
			})
			.catch((caught) => {
				if (!cancelled) {
					setError(
						caught instanceof Error
							? caught.message
							: "Could not read Stellar balances.",
					);
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [candidates, wallet]);

	async function exitPosition(candidate: Candidate) {
		setStatus((current) => ({ ...current, [candidate.assetId]: "Submitting…" }));
		try {
			await new Promise((resolve) => window.setTimeout(resolve, 600));
			setStatus((current) => ({
				...current,
				[candidate.assetId]: "Simulated Stellar exit complete",
			}));
			setRows((current) =>
				current.filter((row) => row.candidate.assetId !== candidate.assetId),
			);
		} catch (caught) {
			setStatus((current) => ({
				...current,
				[candidate.assetId]:
					caught instanceof Error ? caught.message : "Exit failed",
			}));
		}
	}

	return (
		<main className="positions-page">
			<header className="positions-heading">
				<div>
					<span className="eyebrow">Portfolio</span>
					<h1>Your Stellar holdings</h1>
					<p>Stellar balances, price context, and supported exits.</p>
				</div>
			</header>
			{loading ? (
				<div className="positions-loading">
					<LoaderCircle />
					<span>Loading Stellar portfolio…</span>
				</div>
			) : null}
			{error ? (
				<div className="error-message" role="alert">
					{error}
				</div>
			) : null}
			{!loading && !rows.length ? (
				<div className="empty-page">
					<HandCoins size={28} />
					<h2>No holdings yet</h2>
					<p>Complete a Swyft basket on Stellar to see positions here.</p>
				</div>
			) : null}
			<div className="positions-list">
				{rows.map(({ candidate, balanceBaseUnits }) => {
					const amount = Number(
						formatUnits(BigInt(balanceBaseUnits), candidate.decimals),
					);
					const value =
						candidate.marketPriceUsd !== undefined
							? amount * candidate.marketPriceUsd
							: undefined;
					return (
						<article className="position-row" key={candidate.assetId}>
							<AssetMark
								symbol={candidate.symbol}
								iconUrl={candidate.iconUrl}
								size="md"
							/>
							<div className="position-copy">
								<strong>{candidate.symbol}</strong>
								<small>{candidate.name}</small>
							</div>
							<div className="position-metrics">
								<span>
									{amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
								</span>
								<small>
									{value !== undefined ? usdFormatter.format(value) : "—"}
								</small>
							</div>
							<button
								type="button"
								className="button button-outline button-sell"
								onClick={() => void exitPosition(candidate)}
							>
								Exit
							</button>
							{status[candidate.assetId] ? (
								<small className="position-status">
									{status[candidate.assetId]}
								</small>
							) : null}
						</article>
					);
				})}
			</div>
		</main>
	);
}
