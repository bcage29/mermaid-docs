export interface StepNavProps {
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}

/** Previous/next controls. Index 0 is the overview, so `total` counts steps plus it. */
export function StepNav({ index, total, onPrevious, onNext }: StepNavProps) {
  const steps = total - 1;
  return (
    <div className="step-nav">
      <button type="button" onClick={onPrevious} disabled={index <= 0} data-testid="prev-step">
        ◀ Previous
      </button>
      <div className="step-position">
        <span className="step-counter" data-testid="step-counter">
          {index === 0 ? 'Overview' : `Step ${index} of ${steps}`}
        </span>
        <div
          className="step-progress"
          role="progressbar"
          aria-valuenow={index}
          aria-valuemin={0}
          aria-valuemax={steps}
          data-testid="step-progress"
        >
          <div className="step-progress-fill" style={{ width: `${steps > 0 ? (index / steps) * 100 : 0}%` }} />
        </div>
      </div>
      <button type="button" onClick={onNext} disabled={index >= total - 1} data-testid="next-step">
        Next ▶
      </button>
    </div>
  );
}
