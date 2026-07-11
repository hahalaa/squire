import { Component, type ErrorInfo, type ReactNode } from "react";

// A generic error boundary. frontend-engineer.md calls for boundaries around
// the heavier views (Board, CoachingPanel, AnalysisPanel); this ticket wraps
// the repertoire tree view in one so a render fault there degrades to a
// recoverable message instead of blanking the whole app. React only supports
// error boundaries as class components (no hook equivalent).
interface Props {
  children: ReactNode;
  // Optional label so the fallback can name what failed.
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaced to the console for local debugging; a later ticket wires Sentry.
    console.error("ErrorBoundary caught an error:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-card p-6 text-center"
        >
          <p className="font-display text-lg text-foreground">
            {this.props.label ?? "Something went wrong"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            This view hit an unexpected error. Try again.
          </p>
          <button
            onClick={this.reset}
            className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
