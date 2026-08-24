import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { FloatingTabBar, TAB_DESTINATIONS } from '@/components/navigation/FloatingTabBar';

/**
 * The four primary destinations (spec §18). JS tabs — not `NativeTabs` — because the design
 * calls for a floating pill that hovers over content, which a native tab bar cannot be.
 * Imported from `expo-router/js-tabs`; the `Tabs` export on `expo-router` itself is deprecated.
 */
export default function TabsLayout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{ headerShown: false, animation: 'shift' }}
      tabBar={({ state, navigation }) => (
        <FloatingTabBar
          destinations={TAB_DESTINATIONS}
          activeKey={state.routes[state.index]?.name ?? 'today'}
          onSelect={(key) => navigation.navigate(key)}
          onLogPress={() => router.push('/log')}
        />
      )}
    >
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="timeline" options={{ title: 'Timeline' }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
      <Tabs.Screen name="you" options={{ title: 'You' }} />
    </Tabs>
  );
}
