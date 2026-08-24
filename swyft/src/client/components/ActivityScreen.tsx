import {
	ArrowDownLeft,
	ArrowUpRight,
	BriefcaseBusiness,
	ChevronDown,
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

	const grouped = useMemo(() => groupByDay(filtered), [filtered]);

	const netFlow = useMemo(() => {
		let deposits = 0;
		let withdraws = 0;
		for (const event of events) {
			if (event.kind === "deposit" && event.usdAmount > 0) {
				deposits += event.usdAmount;
			}
			if (event.kind === "withdraw" && event.usdAmount > 0) {
				withdraws += event.usdAmount;
			}
		}
		return { deposits, withdraws, net: deposits - withdraws };
	}, [events]);

	const latestHashes =
		latestSettlement?.status === "SETTLED"
			? latestSettlement.transactionHashes.filter((hash) =>
					STELLAR_HASH.test(hash),
				)
			: [];

	if (!wallet) {
		return (
			<main className="activity-page">
				<header className="activity-hero">
					<span className="eyebrow">Activity</span>
					<h1>Connect Freighter</h1>
					<p>
						Basket creates, deposits, withdrawals, and rebalances are stored per
						wallet and linked on Stellar.
					</p>
				</header>
				<section className="activity-empty-card">
					<p>Connect Freighter to load your tagged history.</p>
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

	if (loading && !events.length) {
		return (
			<main className="activity-page">
				<div
					className="activity-feed-loading page-loader"
					role="status"
					aria-live="polite"
				>
					<span className="loader-ring" aria-hidden="true" />
					<p>Loading history…</p>
				</div>
			</main>
		);
	}

	return (
		<main className="activity-page">
			<header className="activity-hero">
				<div className="activity-hero-copy">
					<span className="eyebrow">Activity</span>
					<h1>History</h1>
					<p>
						On-chain basket events — create, approve, deposit, withdraw,
						rebalance — tagged and explorer-linked.
					</p>
				</div>
				<button
					type="button"
					className="button button-outline activity-refresh"
					onClick={() => void load()}
					disabled={loading}
					aria-label="Refresh activity"
				>
					{loading ? (
						<LoaderCircle className="spin" size={16} />
					) : (
						<RefreshCw size={16} />
					)}
					Refresh
				</button>
			</header>

			<section className="activity-summary" aria-label="History summary">
				<article className="activity-stat">
					<small>Events</small>
					<strong>{events.length}</strong>
				</article>
				<article className="activity-stat">
					<small>Deposited</small>
					<strong className="is-in">{formatUsd(netFlow.deposits)}</strong>
				</article>
				<article className="activity-stat">
					<small>Withdrawn</small>
					<strong className="is-out">{formatUsd(netFlow.withdraws)}</strong>
				</article>
				<article className="activity-stat">
					<small>Net flow</small>
					<strong className={netFlow.net >= 0 ? "is-in" : "is-out"}>
						{netFlow.net >= 0 ? "+" : ""}
						{formatUsd(netFlow.net)}
					</strong>
				</article>
			</section>

			{latestHashes.length ? (
				<section className="activity-latest-banner" aria-label="Latest settlement">
					<div>
						<strong>Latest settle recorded</strong>
						<p>Create · approve · deposit landed on testnet.</p>
					</div>
					<div className="activity-latest-hashes">
						{latestHashes.map((hash, index) => (
							<a
								key={hash}
								href={`${EXPLORER}/${hash}`}
								target="_blank"
								rel="noreferrer"
								className="activity-tx-chip"
							>
								{["create", "approve", "deposit"][index] ?? "tx"}
								<span>{shortHash(hash)}</span>
								<ExternalLink size={13} aria-hidden="true" />
							</a>
						))}
					</div>
				</section>
			) : null}

			<section className="activity-feed" aria-label="Tagged history">
				<div className="activity-filter-row" role="tablist" aria-label="Filter">
					{KIND_FILTERS.map((item) => {
						const count = counts[item.id] ?? 0;
						if (item.id !== "all" && count === 0) return null;
						return (
							<button
								key={item.id}
								type="button"
								role="tab"
								aria-selected={filter === item.id}
								className={`activity-filter-chip${filter === item.id ? " is-active" : ""}`}
								onClick={() => setFilter(item.id)}
							>
								{item.label}
								{count > 0 ? <span>{count}</span> : null}
							</button>
						);
					})}
				</div>

				{error ? (
					<p className="activity-feed-error" role="alert">
						{error}
					</p>
				) : null}

				{!loading && !filtered.length ? (
					<section className="activity-empty-card">
						<p>
							No {filter === "all" ? "" : `${filter} `}events yet. Invest from
							Review — create, approve, and deposit are logged automatically.
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
					<div className="activity-timeline">
						{grouped.map((group) => (
							<section key={group.key} className="activity-day-group">
								<header className="activity-day-label">
									<span>{group.label}</span>
									<em>{group.events.length}</em>
								</header>
								<ul className="activity-event-list">
									{group.events.map((event) => {
										const open = expandedId === event.id;
										const copy = kindCopy(event);
										const Icon = copy.Icon;
										const symbols = symbolsFromMeta(event.meta);
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
													<span
														className={`activity-event-icon kind-${event.kind}`}
														aria-hidden="true"
													>
														<Icon size={18} />
													</span>
													<div className="activity-event-main">
														<div className="activity-event-title-row">
															<strong>{copy.title}</strong>
															<span className={`activity-kind-pill kind-${event.kind}`}>
																{copy.badge}
															</span>
														</div>
														<small>
															{event.basketName || `Bucket #${event.bucketId}`}
															<span aria-hidden="true"> · </span>
															{formatWhen(event.at)}
														</small>
													</div>
													<div className="activity-event-side">
														{event.usdAmount > 0 ? (
															<span
																className={`activity-amount-tag ${copy.sign === "−" ? "is-out" : "is-in"}`}
															>
																{copy.sign}
																{formatUsd(event.usdAmount)}
															</span>
														) : (
															<span className="activity-time-tag">
																{formatClock(event.at)}
															</span>
														)}
														<ChevronDown
															className="activity-chevron"
															size={18}
															strokeWidth={2.4}
															aria-hidden="true"
														/>
													</div>
												</button>

												{open ? (
													<div className="activity-event-detail">
														<dl className="activity-detail-grid">
															<div>
																<dt>Basket</dt>
																<dd>
																	{event.basketName || "Untitled"}{" "}
																	<span>#{event.bucketId}</span>
																</dd>
															</div>
															<div>
																<dt>When</dt>
																<dd>{formatFullWhen(event.at)}</dd>
															</div>
															{event.shares ? (
																<div>
																	<dt>Shares</dt>
																	<dd>{trimShares(event.shares)}</dd>
																</div>
															) : null}
															{symbols.length ? (
																<div>
																	<dt>Assets</dt>
																	<dd className="activity-symbol-row">
																		{symbols.map((symbol) => (
																			<span key={symbol}>{symbol}</span>
																		))}
																	</dd>
																</div>
															) : null}
														</dl>

														{event.tags.length ? (
															<div className="activity-tag-row">
																{event.tags.map((tag) => (
																	<span key={tag} className="activity-tag">
																		{tag}
																	</span>
																))}
															</div>
														) : null}

														{event.txHash && STELLAR_HASH.test(event.txHash) ? (
															<a
																href={`${EXPLORER}/${event.txHash}`}
																target="_blank"
																rel="noreferrer"
																className="activity-explorer-link"
															>
																<span>
																	<small>Stellar Expert</small>
																	<strong>{shortHash(event.txHash)}</strong>
																</span>
																<ExternalLink size={16} aria-hidden="true" />
															</a>
														) : null}
													</div>
												) : null}
											</li>
										);
									})}
								</ul>
							</section>
						))}
					</div>
				)}
			</section>

			<div className="activity-feed-actions">
				<button
					type="button"
					className="button button-primary"
					onClick={onViewPortfolio}
				>
					<BriefcaseBusiness aria-hidden="true" size={18} /> Portfolio
				</button>
				<button
					type="button"
					className="button button-outline"
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

function groupByDay(events: BasketActivityEvent[]) {
	const groups: Array<{ key: string; label: string; events: BasketActivityEvent[] }> =
		[];
	const index = new Map<string, number>();
	for (const event of events) {
		const key = dayKey(event.at);
		const existing = index.get(key);
		if (existing === undefined) {
			index.set(key, groups.length);
			groups.push({ key, label: dayLabel(event.at), events: [event] });
		} else {
			groups[existing]?.events.push(event);
		}
	}
	return groups;
}

function dayKey(iso: string) {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "Unknown";
	const today = new Date();
	const yesterday = new Date();
	yesterday.setDate(today.getDate() - 1);
	if (sameDay(d, today)) return "Today";
	if (sameDay(d, yesterday)) return "Yesterday";
	return new Intl.DateTimeFormat("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
	}).format(d);
}

function sameDay(a: Date, b: Date) {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

function symbolsFromMeta(meta: Record<string, unknown>): string[] {
	const raw = meta.symbols;
	if (!Array.isArray(raw)) return [];
	return raw.map(String).filter(Boolean);
}

function shortHash(hash: string) {
	return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function trimShares(shares: string) {
	const n = Number(shares);
	if (!Number.isFinite(n)) return shares;
	return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
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

function formatClock(iso: string) {
	try {
		return new Intl.DateTimeFormat("en-US", {
			hour: "numeric",
			minute: "2-digit",
		}).format(new Date(iso));
	} catch {
		return "";
	}
}

function formatFullWhen(iso: string) {
	try {
		return new Intl.DateTimeFormat("en-US", {
			weekday: "short",
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
		}).format(new Date(iso));
	} catch {
		return iso;
	}
}
