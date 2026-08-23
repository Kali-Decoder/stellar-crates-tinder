/** Button click sample + synthesized Skip / Add tones. */

type SwipeSound = "add" | "skip";

const CLICK_SRC = "/assets/sounds/click.mp3";
const DEDUPE_MS = 70;

let audioCtx: AudioContext | null = null;
let unlocked = false;
let primed: HTMLAudioElement | null = null;
let lastClickAt = 0;
let globalInstalled = false;

function context(): AudioContext | null {
	if (typeof window === "undefined") return null;
	const Ctx =
		window.AudioContext ||
		(window as unknown as { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;
	if (!Ctx) return null;
	if (!audioCtx) audioCtx = new Ctx();
	return audioCtx;
}

function createClickAudio(): HTMLAudioElement {
	const audio = new Audio(CLICK_SRC);
	audio.preload = "auto";
	return audio;
}

function ensurePrimed(): HTMLAudioElement | null {
	if (typeof window === "undefined") return null;
	if (!primed) primed = createClickAudio();
	return primed;
}

function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

/** Call from a user gesture so later keyboard/swipe tones can play. */
export function unlockSwipeAudio() {
	const ctx = context();
	if (ctx?.state === "suspended") void ctx.resume();

	const audio = ensurePrimed();
	if (!audio) {
		unlocked = Boolean(ctx);
		return;
	}
	unlocked = true;
	audio.muted = true;
	void audio
		.play()
		.then(() => {
			audio.pause();
			audio.currentTime = 0;
			audio.muted = false;
		})
		.catch(() => {
			audio.muted = false;
		});
}

function tone(
	ctx: AudioContext,
	{
		frequency,
		start,
		duration,
		type = "sine",
		gain = 0.08,
		slideTo,
	}: {
		frequency: number;
		start: number;
		duration: number;
		type?: OscillatorType;
		gain?: number;
		slideTo?: number;
	},
) {
	const osc = ctx.createOscillator();
	const amp = ctx.createGain();
	osc.type = type;
	osc.frequency.setValueAtTime(frequency, start);
	if (slideTo !== undefined) {
		osc.frequency.exponentialRampToValueAtTime(
			Math.max(1, slideTo),
			start + duration,
		);
	}
	amp.gain.setValueAtTime(0.0001, start);
	amp.gain.exponentialRampToValueAtTime(gain, start + 0.015);
	amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
	osc.connect(amp);
	amp.connect(ctx.destination);
	osc.start(start);
	osc.stop(start + duration + 0.02);
}

/** Synthesized Skip / Add tones (like / dislike). */
export function playSwipeSound(kind: SwipeSound) {
	if (prefersReducedMotion()) return;
	const ctx = context();
	if (!ctx) return;
	if (ctx.state === "suspended") {
		void ctx.resume().then(() => playSwipeSound(kind));
		return;
	}
	unlocked = true;
	const t = ctx.currentTime;

	if (kind === "skip") {
		tone(ctx, {
			frequency: 280,
			slideTo: 160,
			start: t,
			duration: 0.14,
			type: "triangle",
			gain: 0.07,
		});
		tone(ctx, {
			frequency: 190,
			slideTo: 110,
			start: t + 0.04,
			duration: 0.12,
			type: "sine",
			gain: 0.045,
		});
		return;
	}

	tone(ctx, {
		frequency: 520,
		start: t,
		duration: 0.1,
		type: "sine",
		gain: 0.07,
	});
	tone(ctx, {
		frequency: 780,
		start: t + 0.07,
		duration: 0.14,
		type: "triangle",
		gain: 0.06,
	});
	tone(ctx, {
		frequency: 1040,
		start: t + 0.14,
		duration: 0.16,
		type: "sine",
		gain: 0.04,
	});
}

/** Shared `click.mp3` for UI buttons (deduped for overlapping handlers). */
export function playClickSound() {
	if (prefersReducedMotion()) return;
	const now =
		typeof performance !== "undefined" ? performance.now() : Date.now();
	if (now - lastClickAt < DEDUPE_MS) return;
	lastClickAt = now;

	ensurePrimed();
	unlocked = true;

	const audio = createClickAudio();
	audio.volume = 0.48;
	void audio.play().catch(() => {
		/* ignore until unlocked by a gesture */
	});
}

function isUiClickTarget(target: EventTarget | null): boolean {
	if (!(target instanceof Element)) return false;
	const control = target.closest(
		[
			"button",
			'[role="button"]',
			"a.button",
			'input[type="button"]',
			'input[type="submit"]',
			'input[type="reset"]',
			"summary",
			".landing-signin",
			".landing-docs-link",
			".nav-link",
			".trader-link-button",
			".trader-chip-button",
			".icon-button",
			".wallet-button",
			".theme-toggle",
		].join(", "),
	);
	if (!control) return false;
	if (control instanceof HTMLButtonElement && control.disabled) return false;
	if (control instanceof HTMLInputElement && control.disabled) return false;
	if (control.getAttribute("aria-disabled") === "true") return false;
	if (control.hasAttribute("data-no-click-sound")) return false;
	// Skip/Add on the swipe card use synthesized like/dislike tones instead.
	if (
		control.classList.contains("card-hover-reject") ||
		control.classList.contains("card-hover-accept") ||
		control.classList.contains("gesture-skip") ||
		control.classList.contains("gesture-add") ||
		control.closest(".gesture")
	) {
		return false;
	}
	return true;
}

/** Play click.mp3 on UI buttons (once per app boot). */
export function installUiClickSounds() {
	if (typeof window === "undefined" || globalInstalled) return;
	globalInstalled = true;

	const onPointerDown = (event: PointerEvent) => {
		if (event.button !== 0) return;
		if (!isUiClickTarget(event.target)) return;
		unlockSwipeAudio();
		playClickSound();
	};

	window.addEventListener("pointerdown", onPointerDown, true);
}

export function isSwipeAudioUnlocked() {
	return unlocked;
}
