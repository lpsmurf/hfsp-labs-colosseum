import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
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
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="flex items-center justify-center min-h-screen p-6" style={{ background: '#13121b' }}>
          <div className="text-center max-w-md">
            <p className="text-xl font-bold text-red-400 mb-2">Something went wrong</p>
            <p className="text-gray-400 text-sm mb-4">{this.state.error.message}</p>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
