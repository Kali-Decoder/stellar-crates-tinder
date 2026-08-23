import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft } from "lucide-react";
import { DOCS_SECTIONS } from "../docs-content";

export function DocsScreen({ onBack }: { onBack?: () => void }) {
	const [activeId, setActiveId] = useState(DOCS_SECTIONS[0]?.id ?? "overview");
	const [enterKey, setEnterKey] = useState(0);
	const index = useMemo(
		() => Math.max(0, DOCS_SECTIONS.findIndex((section) => section.id === activeId)),
		[activeId],
	);
	const active = DOCS_SECTIONS[index] ?? DOCS_SECTIONS[0]!;
	const prev = index > 0 ? DOCS_SECTIONS[index - 1] : undefined;
	const next =
		index < DOCS_SECTIONS.length - 1 ? DOCS_SECTIONS[index + 1] : undefined;

	function selectSection(id: string) {
		if (id === activeId) return;
		setActiveId(id);
		setEnterKey((value) => value + 1);
	}

	useEffect(() => {
		window.scrollTo({ top: 0, behavior: "auto" });
	}, [activeId]);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable)
			) {
				return;
			}
			if (event.key === "ArrowLeft" && prev) {
				event.preventDefault();
				selectSection(prev.id);
			}
			if (event.key === "ArrowRight" && next) {
				event.preventDefault();
				selectSection(next.id);
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [prev, next, activeId]);

	return (
		<main className="docs-page">
			<aside className="docs-rail" aria-label="Documentation">
				<div className="docs-rail-brand">
					{onBack ? (
						<button type="button" className="docs-back" onClick={onBack}>
							<ChevronLeft size={16} strokeWidth={2.4} aria-hidden="true" />
							<span>Back</span>
						</button>
					) : null}
					<p className="docs-rail-kicker">Product guide</p>
					<h2 className="docs-rail-logo">
						swyft<span>.fun</span>
					</h2>
					<p className="docs-rail-tagline">
						How the Stellar swipe ritual works — from plan to vault deposit.
					</p>
				</div>

				<nav className="docs-toc" aria-label="Sections">
					{DOCS_SECTIONS.map((section, sectionIndex) => {
						const activeSection = section.id === active.id;
						return (
							<button
								type="button"
								key={section.id}
								className={activeSection ? "is-active" : ""}
								aria-current={activeSection ? "page" : undefined}
								onClick={() => selectSection(section.id)}
							>
								<span className="docs-toc-index" aria-hidden="true">
									{String(sectionIndex + 1).padStart(2, "0")}
								</span>
								<span className="docs-toc-copy">
									<strong>{section.title}</strong>
									<small>{section.summary}</small>
								</span>
							</button>
						);
					})}
				</nav>
			</aside>

			<section className="docs-stage">
				<article
					key={enterKey}
					className="docs-panel"
					aria-labelledby="docs-title"
				>
					<header className="docs-panel-head">
						<span className="docs-progress">
							{String(index + 1).padStart(2, "0")}
							<span>/</span>
							{String(DOCS_SECTIONS.length).padStart(2, "0")}
						</span>
						<h1 id="docs-title">{active.title}</h1>
						<p className="docs-lede">{active.summary}</p>
					</header>

					<div className="docs-body">
						{active.body.map((paragraph) => (
							<p key={paragraph}>{paragraph}</p>
						))}

						{active.bullets?.length ? (
							<ul className="docs-points">
								{active.bullets.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						) : null}

						{active.note ? (
							<p className="docs-callout" role="note">
								{active.note}
							</p>
						) : null}
					</div>

					<footer className="docs-footer">
						<nav className="docs-pager" aria-label="Section pager">
							{prev ? (
								<button
									type="button"
									className="docs-pager-link is-prev"
									onClick={() => selectSection(prev.id)}
								>
									<ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" />
									<span>
										<small>Previous</small>
										<strong>{prev.title}</strong>
									</span>
								</button>
							) : (
								<span className="docs-pager-spacer" aria-hidden="true" />
							)}
							{next ? (
								<button
									type="button"
									className="docs-pager-link is-next"
									onClick={() => selectSection(next.id)}
								>
									<span>
										<small>Next</small>
										<strong>{next.title}</strong>
									</span>
									<ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
								</button>
							) : (
								<span className="docs-pager-spacer" aria-hidden="true" />
							)}
						</nav>

						<div className="docs-footer-bar">
							<div
								className="docs-dots"
								role="tablist"
								aria-label="Jump to section"
							>
								{DOCS_SECTIONS.map((section, sectionIndex) => (
									<button
										type="button"
										key={section.id}
										role="tab"
										aria-selected={section.id === active.id}
										aria-label={`${section.title}`}
										className={
											section.id === active.id
												? "docs-dot is-active"
												: "docs-dot"
										}
										onClick={() => selectSection(section.id)}
									>
										<span className="sr-only">{section.title}</span>
										<span aria-hidden="true">
											{String(sectionIndex + 1).padStart(2, "0")}
										</span>
									</button>
								))}
							</div>
							<p className="docs-disclaimer">
								<span>Not investment advice. Non-custodial on Stellar.</span>
								<kbd className="docs-keys" aria-label="Keyboard shortcuts">
									<span>←</span>
									<span>→</span>
								</kbd>
							</p>
						</div>
					</footer>
				</article>
			</section>
		</main>
	);
}
