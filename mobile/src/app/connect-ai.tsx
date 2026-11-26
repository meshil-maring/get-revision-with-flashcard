import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button, colors, Icon, type IconName } from '@/components/ui';
import { useAccount } from '@/providers/account';
import { isReachableFromInternet, MCP_URL } from '@/services/api';

type App = { name: string; icon: IconName; steps: string[] };

// Where each app keeps custom connectors. Menu names change now and then; these match late 2026.
const APPS: App[] = [
  {
    name: 'ChatGPT',
    icon: 'chatbubble-ellipses-outline',
    steps: [
      'On chatgpt.com, open Settings → Apps & Connectors → Advanced settings and turn on Developer mode.',
      'Go back to Apps & Connectors and choose Create.',
      'Name it StudyMe, paste the link below as the server URL, choose OAuth, and create it.',
      'Sign in with your StudyMe account and tap Allow.',
      'In a chat, pick StudyMe from the + menu, then ask away.',
    ],
  },
  {
    name: 'Claude',
    icon: 'sparkles-outline',
    steps: [
      'On claude.ai, open Settings → Connectors and choose Add custom connector.',
      'Name it StudyMe, paste the link below, and add it.',
      'Choose Connect, sign in with your StudyMe account and tap Allow.',
      'In a chat, turn StudyMe on from the tools menu, then ask away.',
    ],
  },
];

const EXAMPLES = [
  'Make a 20-card deck on the causes of World War I.',
  'Write Cornell notes on photosynthesis in Class 10 / Biology, tagged Exam.',
  'Read my note on cell structure and make flashcards from it.',
  'Which decks do I have for chemistry?',
];

/** URL: /connect-ai — how to let ChatGPT or Claude make notes and flashcards in your account. */
export default function ConnectAiScreen() {
  const { user } = useAccount();
  const [copied, setCopied] = useState(false);
  const reachable = isReachableFromInternet(MCP_URL);

  async function copy() {
    await Clipboard.setStringAsync(MCP_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="w-full max-w-xl self-center p-5 gap-5">
      <View className="gap-1">
        <Text className="text-2xl font-extrabold text-ink">Connect ChatGPT or Claude</Text>
        <Text className="text-base text-muted">
          Add StudyMe to your AI app once. Then just ask it to make flashcards or notes, and they appear here on your
          next sync. It can read what you have and add new things, but it can&apos;t change or delete anything.
        </Text>
      </View>

      {!user ? (
        <View className="gap-3 rounded-3xl bg-primary-soft p-5">
          <Text className="text-base font-bold text-ink">Sign in first</Text>
          <Text className="text-sm text-muted">
            The AI app adds things to your StudyMe account, so you need one. Your guest decks and notes move into it.
          </Text>
          <Button label="Sign in or create account" icon="person-outline" onPress={() => router.push('/account')} />
        </View>
      ) : null}

      <View className="gap-3 rounded-3xl bg-surface p-5">
        <Text className="text-base font-bold text-ink">Connector link</Text>
        <Text selectable className="rounded-xl bg-white px-4 py-3 text-base text-ink" accessibilityLabel="Connector link">
          {MCP_URL}
        </Text>
        <Button
          label={copied ? 'Copied' : 'Copy link'}
          icon={copied ? 'checkmark' : 'copy-outline'}
          variant="secondary"
          onPress={() => void copy()}
        />
        {!reachable ? (
          <View className="flex-row gap-2">
            <Icon name="warning-outline" size={20} color={colors.alert} />
            <Text className="flex-1 text-sm text-alert">
              This is a local address. ChatGPT and Claude can only reach a server on the internet with https. Put the
              server online, or open a tunnel to it (see backend/README.md, &quot;Connect an AI app&quot;).
            </Text>
          </View>
        ) : null}
      </View>

      {APPS.map((app) => (
        <View key={app.name} className="gap-3 rounded-3xl bg-surface p-5">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Icon name={app.icon} size={20} color={colors.white} />
            </View>
            <Text className="text-lg font-bold text-ink">{app.name}</Text>
          </View>
          {app.steps.map((step, i) => (
            <View key={step} className="flex-row gap-3">
              <Text className="w-5 text-base font-bold text-primary">{i + 1}.</Text>
              <Text className="flex-1 text-base text-ink">{step}</Text>
            </View>
          ))}
        </View>
      ))}

      <View className="gap-2 rounded-3xl bg-surface p-5">
        <Text className="text-base font-bold text-ink">Things to ask</Text>
        {EXAMPLES.map((example) => (
          <Text key={example} className="text-base text-ink">
            • “{example}”
          </Text>
        ))}
        <Text className="mt-1 text-sm text-muted">Notes an AI writes show its name, so you can tell them apart.</Text>
      </View>

      <Pressable onPress={() => router.push('/help/ai-apps')} accessibilityRole="link" className="items-center py-2">
        <Text className="text-base font-semibold text-primary">More about AI apps</Text>
      </Pressable>
    </ScrollView>
  );
}
