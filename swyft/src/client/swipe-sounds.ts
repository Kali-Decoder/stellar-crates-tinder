/** Short UI tones for swipe Skip / Add. Synthesized — no asset files. */

type SwipeSound = "add" | "skip";

let audioCtx: AudioContext | null = null;
let unlocked = false;

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

/** Call from a user gesture so later keyboard/swipe tones can play. */
export function unlockSwipeAudio() {
	const ctx = context();
	if (!ctx) return;
	if (ctx.state === "suspended") void ctx.resume();
	unlocked = true;
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

export function playSwipeSound(kind: SwipeSound) {
	if (
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	) {
		return;
	}
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

export function isSwipeAudioUnlocked() {
	return unlocked;
}
