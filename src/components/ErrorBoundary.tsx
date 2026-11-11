import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Lightweight error boundary — catches render crashes in a subtree and shows
 * a safe fallback instead of a blank white screen.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('ErrorBoundary caught:', error);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <p className="text-sm font-semibold mb-1" style={{ color: 'inherit' }}>
            {this.props.fallbackLabel || 'Something went wrong.'}
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
