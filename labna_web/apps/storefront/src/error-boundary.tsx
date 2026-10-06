import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean };

/** Catches render-time failures anywhere under the app so a single broken page
 * cannot leave the shopper with a blank screen and no way forward. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled storefront error', error, info.componentStack);
  }

  private readonly retry = () => {
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="state-card error-boundary" role="alert">
        <h1>حدث خطأ غير متوقع</h1>
        <p>Something went wrong while loading this page. Your cart is safe.</p>
        <p className="muted">العربة لم تتأثر. يمكنك إعادة المحاولة.</p>
        <button className="button" type="button" onClick={this.retry}>
          إعادة المحاولة / Try again
        </button>
      </div>
    );
  }
}
