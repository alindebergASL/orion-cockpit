import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  tabName?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Error in ${this.props.tabName || 'component'}:`, error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-amber-400" />
          <div>
            <h2 className="text-lg font-semibold text-th-text">
              Something went wrong{this.props.tabName ? ` in ${this.props.tabName}` : ''}
            </h2>
            <p className="mt-1 max-w-md text-sm text-th-text-secondary">
              {this.state.error.message || 'An unexpected error occurred.'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={this.reset}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm text-white hover:bg-cyan-500"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border border-th-border px-4 py-2 text-sm text-th-text-secondary hover:bg-th-elevated"
            >
              Reload app
            </button>
          </div>
          {import.meta.env.DEV && this.state.error.stack && (
            <details className="mt-2 max-w-2xl text-left">
              <summary className="cursor-pointer text-xs text-th-text-muted hover:text-th-text-secondary">
                Stack trace
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-th-input p-3 text-[11px] text-th-text-muted">
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
