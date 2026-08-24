import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';

import { Button, Screen, Text } from '@/components/ui';

type Props = {
  children: ReactNode;
  /** Called on capture. Milestone 16 wires this to Sentry (with scrubbing). */
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = { error: Error | null };

/**
 * Top-level error boundary.
 *
 * Shows a calm, human message and a way forward — never a stack trace (spec §100). The error
 * text itself is deliberately NOT rendered: a crash inside a logging screen could otherwise
 * surface health content on screen, and eventually into a screenshot or a support ticket.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private readonly reset = () => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
          <Text variant="title">Something went wrong</Text>
          <Text variant="body" color="secondary">
            GutSignal hit an unexpected problem. Your logs are stored on this device and have not
            been lost.
          </Text>
          <View style={{ height: 12 }} />
          <Button label="Try again" onPress={this.reset} />
        </View>
      </Screen>
    );
  }
}
