import { Component, type ReactNode, type ErrorInfo } from "react";

// ── Types ────────────────────────────────────────────────────────────

type ErrorBoundaryProps = {
  /** Unique key for this boundary — changing it forces a remount/reset */
  readonly name: string;
  /** What to show when an error is caught. Receives error + reset fn. */
  readonly fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Auto-retry after this many ms. 0 = no auto-retry. Default: 5000 */
  readonly autoRetryMs?: number;
  readonly children?: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
  errorCount: number;
};

// ── Default fallback ─────────────────────────────────────────────────

function DefaultFallback({
  error,
  reset,
  name,
}: {
  error: Error;
  reset: () => void;
  name: string;
}) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-sig-bg/80 p-4">
      <div className="text-center max-w-xs">
        <div
          className="text-sig-danger font-semibold tracking-wider mb-2 text-(length:--sig-text-md)"
        >
          {name.toUpperCase()} ERROR
        </div>
        <div
          className="text-sig-dim mb-3 break-words text-(length:--sig-text-sm)"
        >
          {error.message}
        </div>
        <button
          onClick={reset}
          className="px-3 py-1.5 rounded text-sig-accent border border-sig-accent/40 bg-sig-accent/10 hover:bg-sig-accent/20 transition-colors tracking-wider font-semibold text-(length:--sig-text-sm)"
        >
          RETRY
        </button>
      </div>
    </div>
  );
}

// ── ErrorBoundary ────────────────────────────────────────────────────

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  override state: ErrorBoundaryState = { error: null, errorCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name}]`, error, info);
  }

  override componentDidUpdate(
    _: ErrorBoundaryProps,
    prevState: ErrorBoundaryState,
  ) {
    const { error, errorCount } = this.state;
    const autoRetryMs = this.props.autoRetryMs ?? 5000;

    // Set up auto-retry when error first appears
    if (error && !prevState.error && autoRetryMs > 0 && errorCount < 3) {
      this.clearRetryTimer();
      this.retryTimer = setTimeout(() => this.reset(), autoRetryMs);
    }
  }

  override componentWillUnmount() {
    this.clearRetryTimer();
  }

  private clearRetryTimer() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private reset = () => {
    this.clearRetryTimer();
    this.setState((prev) => ({
      error: null,
      errorCount: prev.errorCount + 1,
    }));
  };

  override render() {
    const { error } = this.state;
    const { children, fallback, name } = this.props;

    if (error) {
      if (fallback) return fallback(error, this.reset);
      return <DefaultFallback error={error} reset={this.reset} name={name} />;
    }

    return children;
  }
}
