import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  errorStack: string | null;
}

/**
 * Error boundary — catches render crashes in a subtree and shows
 * a safe fallback with the actual error details instead of a white screen.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: '', errorStack: null };

  static getDerivedStateFromError(error: unknown): State {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : null;
    return { hasError: true, errorMessage: msg, errorStack: stack };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    console.error('ErrorBoundary caught:', error);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : null);
    console.error('Component stack:', info.componentStack || '(none)');
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '', errorStack: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <p className="text-sm font-semibold mb-1" style={{ color: 'inherit' }}>
            {this.props.fallbackLabel || 'Something went wrong.'}
          </p>
          <p className="text-xs mb-2 opacity-70 font-mono break-all">
            {this.state.errorMessage}
          </p>
          <p className="text-xs mb-4 opacity-60">An unexpected error occurred. Try reloading.</p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white"
            style={{ background: '#2563eb', border: 'none', cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
