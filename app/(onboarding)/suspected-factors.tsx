import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, SelectCard, Text, TextField } from '@/components/ui';
import { SUSPECTED_FACTORS, customFactorKey } from '@/domain/onboarding/options';
import { OnboardingStep } from '@/features/onboarding/OnboardingStep';
import { useOnboardingDraft } from '@/features/onboarding/draftStore';
import { useTheme } from '@/theme';

/**
 * Suspected factors (spec §27).
 *
 * These are hypotheses, never findings. The engine uses them to decide what to examine first;
 * it does not treat them as evidence, and it is entirely possible for GutSignal to conclude
 * there is no clear relationship for something the user was sure about.
 *
 * "I'm not sure" is deliberately prominent — the spec calls this out as an important user, and
 * a screen full of suspects can otherwise pressure someone into inventing certainty.
 */
export default function SuspectedFactorsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const suspectedFactors = useOnboardingDraft((state) => state.suspectedFactors);
  const toggleFactor = useOnboardingDraft((state) => state.toggleFactor);
  const addCustomFactor = useOnboardingDraft((state) => state.addCustomFactor);

  const [customLabel, setCustomLabel] = useState('');

  const custom = suspectedFactors.filter((factor) => factor.label !== undefined);

  const addCustom = () => {
    const label = customLabel.trim();
    if (label.length === 0) return;

    addCustomFactor({ key: customFactorKey(label), label });
    setCustomLabel('');
  };

  const next = () => router.push('/(onboarding)/tracking-style');

  return (
    <OnboardingStep
      step="suspected-factors"
      title="Anything you already suspect affects you?"
      subtitle="GutSignal will look at these first — and will tell you honestly if the evidence doesn't support them."
      onPrimary={next}
      secondaryLabel="I'm not sure yet"
      onSecondary={next}
    >
      <View style={{ gap: theme.spacing.xs }}>
        {SUSPECTED_FACTORS.map((factor) => (
          <SelectCard
            key={factor.key}
            label={factor.label}
            selected={suspectedFactors.some((item) => item.key === factor.key)}
            onPress={() => toggleFactor({ key: factor.key })}
          />
        ))}

        {custom.map((factor) => (
          <SelectCard
            key={factor.key}
            label={factor.label ?? factor.key}
            description="Added by you"
            selected
            onPress={() => toggleFactor(factor)}
          />
        ))}
      </View>

      <Card elevation="flat">
        <Text variant="cardTitle">Something else?</Text>
        <View style={{ height: theme.spacing.xs }} />
        <TextField
          label="Add your own"
          value={customLabel}
          onChangeText={setCustomLabel}
          placeholder="e.g. kefir"
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={addCustom}
          maxLength={120}
        />
        <View style={{ height: theme.spacing.sm }} />
        <Button
          label="Add"
          variant="secondary"
          size="medium"
          disabled={customLabel.trim().length === 0}
          onPress={addCustom}
        />
      </Card>
    </OnboardingStep>
  );
}
