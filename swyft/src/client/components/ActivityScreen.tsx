import {
	ArrowDownLeft,
	ArrowUpRight,
	BriefcaseBusiness,
	ExternalLink,
	LoaderCircle,
	RefreshCw,
	Scale,
	ShieldCheck,
	Sparkles,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExecutionRecord } from "../api";
import {
	listWalletActivity,
	type BasketActivityEvent,
	type BasketActivityKind,
} from "../stellar/portfolio-api";

const STELLAR_HASH = /^[a-fA-F0-9]{64}$/;
const EXPLORER = "https://stellar.expert/explorer/testnet/tx";

const KIND_FILTERS: Array<{ id: "all" | BasketActivityKind; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "create", label: "Create" },
	{ id: "deposit", label: "Deposit" },
	{ id: "withdraw", label: "Withdraw" },
	{ id: "rebalance", label: "Rebalance" },
	{ id: "approve", label: "Approve" },
	{ id: "close", label: "Close" },
];

export function ActivityScreen({
	wallet,
	latestSettlement,
	onViewPortfolio,
	onStartNextBasket,
}: {
	wallet: string;
	latestSettlement?: ExecutionRecord;
	onViewPortfolio: () => void;
	onStartNextBasket: () => void;
}) {
	const [events, setEvents] = useState<BasketActivityEvent[]>([]);
	const [loading, setLoading] = useState(Boolean(wallet));
	const [error, setError] = useState("");
	const [filter, setFilter] = useState<"all" | BasketActivityKind>("all");
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!wallet) {
			setEvents([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		setError("");
		try {
			const payload = await listWalletActivity(wallet, { limit: 200 });
			setEvents(payload.events);
			if (payload.events[0]) setExpandedId(payload.events[0].id);
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Could not load activity history",
			);
		} finally {
			setLoading(false);
		}
	}, [wallet]);

	useEffect(() => {
		void load();
	}, [load, latestSettlement?.settledAt, latestSettlement?.status]);

	const filtered = useMemo(
		() =>
			filter === "all" ? events : events.filter((event) => event.kind === filter),
		[events, filter],
	);

	const counts = useMemo(() => {
		const map: Record<string, number> = { all: events.length };
		for (const event of events) {
			map[event.kind] = (map[event.kind] ?? 0) + 1;
		}
		return map;
	}, [events]);

	const latestHashes =
		latestSettlement?.status === "SETTLED"
			? latestSettlement.transactionHashes.filter((hash) =>
					STELLAR_HASH.test(hash),
				)
			: [];

	if (!wallet) {
		return (
			<main className="receipt-page activity-page">
				<header className="activity-hero">
					<span className="eyebrow">Activity</span>
					<h1>Connect Freighter</h1>
					<p>
						Your basket create, deposit, withdraw, and rebalance history is
						stored per wallet.
					</p>
				</header>
				<section className="activity-empty-card">
					<p>Connect Freighter to load tagged transaction history.</p>
					<button
						type="button"
						className="button button-primary"
						onClick={onStartNextBasket}
					>
						Go to basket
					</button>
				</section>
			</main>
		);
	}

	return (
		<main className="receipt-page activity-page">
			<header className="activity-hero">
				<div className="activity-hero-top">
					<span className="activity-status-orb is-ok" aria-hidden="true">
						<Sparkles size={22} />
					</span>
					<div>
						<span className="eyebrow">Activity</span>
						<h1>Transaction history</h1>
						<p>
							Every basket create, USDC approve, deposit, withdrawal, and
							rebalance — tagged and linked on Stellar.
						</p>
					</div>
				</div>
				<div className="activity-hero-tags">
					<span className="activity-tag">Stellar</span>
					<span className="activity-tag">bucket-vault</span>
					<span className="activity-tag">{events.length} events</span>
				</div>
			</header>

			<section className="activity-summary" aria-label="History summary">
				<div className="activity-stat">
					<small>Creates</small>
					<strong>{counts.create ?? 0}</strong>
				</div>
				<div className="activity-stat">
					<small>Deposits</small>
					<strong>{counts.deposit ?? 0}</strong>
				</div>
				<div className="activity-stat">
					<small>Withdrawals</small>
					<strong>{counts.withdraw ?? 0}</strong>
				</div>
				<div className="activity-stat">
					<small>Rebalances</small>
					<strong>{counts.rebalance ?? 0}</strong>
				</div>
			</section>

			{latestHashes.length ? (
				<section className="activity-latest-banner" aria-label="Latest settlement">
					<strong>Latest settlement synced</strong>
					<p>
						Create · approve · deposit recorded. Open any row below for explorer
						links and tags.
					</p>
					<div className="activity-latest-hashes">
						{latestHashes.map((hash, index) => (
							<a
								key={hash}
								href={`${EXPLORER}/${hash}`}
								target="_blank"
								rel="noreferrer"
								className="activity-tx-link"
							>
								{["create", "approve", "deposit"][index] ?? "tx"} {shortHash(hash)}
								<ExternalLink size={14} aria-hidden="true" />
							</a>
						))}
					</div>
				</section>
			) : null}

			<section className="activity-feed" aria-label="Tagged history">
				<div className="activity-feed-toolbar">
					<div className="activity-filter-row" role="tablist" aria-label="Filter">
						{KIND_FILTERS.map((item) => (
							<button
								key={item.id}
								type="button"
								role="tab"
								aria-selected={filter === item.id}
								className={`activity-filter-chip${filter === item.id ? " is-active" : ""}`}
								onClick={() => setFilter(item.id)}
							>
								{item.label}
								{(counts[item.id] ?? 0) > 0 ? (
									<span>{counts[item.id]}</span>
								) : null}
							</button>
						))}
					</div>
					<button
						type="button"
						className="button button-secondary activity-refresh"
						onClick={() => void load()}
						disabled={loading}
					>
						{loading ? (
							<LoaderCircle className="spin" size={16} />
						) : (
							<RefreshCw size={16} />
						)}
						Refresh
					</button>
				</div>

				{error ? <p className="activity-feed-error">{error}</p> : null}

				{loading && !events.length ? (
					<p className="activity-feed-loading">Loading history…</p>
				) : null}

				{!loading && !filtered.length ? (
					<section className="activity-empty-card">
						<p>
							No {filter === "all" ? "" : `${filter} `}events yet. Invest from
							Review to create a basket — create, approve, and deposit are
							logged automatically.
						</p>
						<button
							type="button"
							className="button button-primary"
							onClick={onStartNextBasket}
						>
							New basket
						</button>
					</section>
				) : (
					<ul className="activity-event-list">
						{filtered.map((event) => {
							const open = expandedId === event.id;
							const copy = kindCopy(event);
							const Icon = copy.Icon;
							return (
								<li
									key={event.id}
									className={`activity-event-card kind-${event.kind}${open ? " is-open" : ""}`}
								>
									<button
										type="button"
										className="activity-event-toggle"
										aria-expanded={open}
										onClick={() =>
											setExpandedId((current) =>
												current === event.id ? null : event.id,
											)
										}
									>
										<span className={`activity-event-icon kind-${event.kind}`}>
											<Icon size={18} aria-hidden="true" />
										</span>
										<div className="activity-event-main">
											<strong>{copy.title}</strong>
											<small>
												{event.basketName || `Bucket #${event.bucketId}`}
												{" · "}
												{formatWhen(event.at)}
											</small>
										</div>
										<div className="activity-event-side">
											{event.usdAmount > 0 ? (
												<span className="activity-amount-tag">
													{copy.sign}
													{formatUsd(event.usdAmount)}
												</span>
											) : (
												<span className="activity-status-tag">{copy.badge}</span>
											)}
										</div>
									</button>

									{open ? (
										<div className="activity-event-detail">
											<div className="activity-tag-row">
												{event.tags.map((tag) => (
													<span key={tag} className="activity-tag">
														{tag}
													</span>
												))}
											</div>
											<div className="activity-detail-row">
												<span>Kind</span>
												<strong>{event.kind}</strong>
											</div>
											<div className="activity-detail-row">
												<span>Bucket</span>
												<strong>#{event.bucketId}</strong>
											</div>
											{event.shares ? (
												<div className="activity-detail-row">
													<span>Shares</span>
													<strong>{event.shares}</strong>
												</div>
											) : null}
											{symbolsFromMeta(event.meta).length ? (
												<div className="activity-detail-row">
													<span>Assets</span>
													<strong>
														{symbolsFromMeta(event.meta).join(", ")}
													</strong>
												</div>
											) : null}
											{event.txHash && STELLAR_HASH.test(event.txHash) ? (
												<div className="activity-detail-row">
													<span>Transaction</span>
													<a
														href={`${EXPLORER}/${event.txHash}`}
														target="_blank"
														rel="noreferrer"
														className="activity-tx-link"
													>
														{shortHash(event.txHash)}
														<ExternalLink size={14} aria-hidden="true" />
													</a>
												</div>
											) : null}
										</div>
									) : null}
								</li>
							);
						})}
					</ul>
				)}
			</section>

			<div className="receipt-actions activity-feed-actions">
				<button
					type="button"
					className="button button-primary"
					onClick={onViewPortfolio}
				>
					<BriefcaseBusiness aria-hidden="true" /> Portfolio
				</button>
				<button
					type="button"
					className="button button-secondary"
					onClick={onStartNextBasket}
				>
					New basket
				</button>
			</div>
		</main>
	);
}

function kindCopy(event: BasketActivityEvent) {
	switch (event.kind) {
		case "create":
			return {
				title: "Basket created",
				badge: "Create",
				sign: "",
				Icon: Sparkles,
			};
		case "approve":
			return {
				title: "USDC approved",
				badge: "Approve",
				sign: "",
				Icon: ShieldCheck,
			};
		case "deposit":
			return {
				title: event.tags.includes("initial")
					? "Initial deposit"
					: "Deposit",
				badge: "Deposit",
				sign: "+",
				Icon: ArrowDownLeft,
			};
		case "withdraw":
			return {
				title: "Withdrawal",
				badge: "Withdraw",
				sign: "−",
				Icon: ArrowUpRight,
			};
		case "rebalance":
			return {
				title: "Rebalanced",
				badge: "Rebalance",
				sign: "",
				Icon: Scale,
			};
		case "close":
			return {
				title: "Basket closed",
				badge: "Closed",
				sign: "",
				Icon: XCircle,
			};
		default:
			return {
				title: event.kind,
				badge: event.kind,
				sign: "",
				Icon: Sparkles,
			};
	}
}

function symbolsFromMeta(meta: Record<string, unknown>): string[] {
	const raw = meta.symbols;
	if (!Array.isArray(raw)) return [];
	return raw.map(String).filter(Boolean);
}

function shortHash(hash: string) {
	return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function formatUsd(n: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 2,
	}).format(n);
}

function formatWhen(iso: string) {
	try {
		return new Intl.DateTimeFormat("en-US", {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		}).format(new Date(iso));
	} catch {
		return iso;
	}
}
