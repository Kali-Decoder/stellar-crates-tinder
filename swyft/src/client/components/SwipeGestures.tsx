import { Heart, X } from "lucide-react";
import { unlockSwipeAudio } from "../swipe-sounds";

export function SwipeGestures({
	onSkip,
	onAdd,
	addLabel,
	disabled,
	addDisabled,
}: {
	onSkip: () => void;
	onAdd: () => void;
	addLabel: string;
	disabled?: boolean;
	addDisabled?: boolean;
}) {
	return (
		<div
			className="gesture-bar"
			role="group"
			aria-label="Swipe actions"
			onPointerDown={unlockSwipeAudio}
		>
			<button
				type="button"
				className="gesture gesture-skip"
				onClick={onSkip}
				aria-label="Skip asset"
				disabled={disabled}
			>
				<span className="gesture-dir" aria-hidden="true">
					<X size={28} strokeWidth={2.6} />
				</span>
				<span className="gesture-label">Skip</span>
				<kbd className="gesture-key">←</kbd>
			</button>
			<button
				type="button"
				className="gesture gesture-add"
				onClick={onAdd}
				aria-label={addLabel}
				disabled={disabled || addDisabled}
			>
				<span className="gesture-dir" aria-hidden="true">
					<Heart size={26} strokeWidth={2.4} fill="currentColor" />
				</span>
				<span className="gesture-label">Add</span>
				<kbd className="gesture-key">→</kbd>
			</button>
		</div>
	);
}
