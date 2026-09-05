import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleHardReload = () => {
    localStorage.removeItem('fortune_sacco_application_id');
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-fortune-ink/10 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-fortune-terracotta/10 text-fortune-terracotta">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-fortune-ink">
              {this.props.fallbackLabel || 'Something went wrong'}
            </h2>
            <p className="mt-2 text-sm text-fortune-ink/60">
              An unexpected error occurred. You can try again or start fresh.
            </p>
            <div className="mt-6 flex gap-3">
              <button onClick={this.handleReset} className="btn-secondary flex-1">
                Try again
              </button>
              <button onClick={this.handleHardReload} className="btn-primary flex-1">
                Start fresh
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
