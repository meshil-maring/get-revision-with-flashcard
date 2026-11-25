import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';

import { Button, colors, Icon } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { authClient } from '@/lib/auth-client';
import { confirm } from '@/lib/confirm';
import { syncedAgo } from '@/lib/dates';
import { fetchServerConfig } from '@/lib/sync-api';

const NO_WEB_FOCUS_RING = { outlineStyle: 'none' } as unknown as TextStyle;

/** URL: /account — sign in, or see the account and its sync. */
export default function AccountScreen() {
  const { user, isPending } = useAccount();
  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-page">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return user ? <SignedIn /> : <SignInForm />;
}

// --- signed in ---------------------------------------------------------------------

function SignedIn() {
  const { user, syncStatus, syncError, lastSyncedAt, syncNow, signOut } = useAccount();
  const [signingOut, setSigningOut] = useState(false);
  if (!user) return null;

  async function onSignOut() {
    const ok = await confirm(
      'Sign out?',
      'Your decks and notes stay in your account and are removed from this device.',
      'Sign out',
    );
    if (!ok) return;
    setSigningOut(true);
    try {
      let result = await signOut();
      if (result) {
        const force = await confirm(
          'Some changes are not saved',
          `${result.unsynced} change(s) could not reach your account (are you offline?). Sign out anyway and lose them?`,
          'Sign out anyway',
        );
        if (!force) return;
        result = await signOut({ force: true });
      }
      router.back();
    } finally {
      setSigningOut(false);
    }
  }

  const status =
    syncStatus === 'syncing'
      ? 'Syncing…'
      : syncStatus === 'error'
        ? (syncError ?? 'Sync failed.')
        : lastSyncedAt
          ? `Synced ${syncedAgo(lastSyncedAt)}`
          : 'Not synced yet';

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="w-full max-w-xl self-center p-5 gap-5">
      <View className="items-center gap-2 rounded-3xl bg-surface p-6">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-primary">
          <Text className="text-2xl font-extrabold text-white">
            {(user.name || user.email).charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text className="text-xl font-extrabold text-ink">{user.name}</Text>
        <Text className="text-base text-muted">{user.email}</Text>
      </View>

      <View className="gap-3 rounded-3xl bg-surface p-5">
        <View className="flex-row items-center gap-3">
          <Icon
            name={syncStatus === 'error' ? 'cloud-offline-outline' : 'cloud-done-outline'}
            size={26}
            color={syncStatus === 'error' ? colors.alert : colors.calm}
          />
          <View className="flex-1">
            <Text className="text-base font-bold text-ink">Backup & sync</Text>
            <Text
              accessibilityLiveRegion="polite"
              className={`text-sm ${syncStatus === 'error' ? 'text-alert' : 'text-muted'}`}
            >
              {status}
            </Text>
          </View>
        </View>
        <Text className="text-sm text-muted">
          Your decks, cards, notes and tags are saved to your account and kept the same on every device you sign in on.
          Pictures and recordings stay on this device for now.
        </Text>
        <Button
          label="Sync now"
          icon="sync-outline"
          variant="secondary"
          onPress={() => void syncNow()}
          disabled={syncStatus === 'syncing'}
        />
      </View>

      <Button
        label={signingOut ? 'Signing out…' : 'Sign out'}
        icon="log-out-outline"
        variant="secondary"
        onPress={onSignOut}
        disabled={signingOut}
      />
    </ScrollView>
  );
}

// --- sign in / create account ------------------------------------------------------

type Mode = 'sign-in' | 'sign-up';

function Field(props: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  secure?: boolean;
  keyboard?: 'email-address' | 'default';
  autoComplete?: 'email' | 'password' | 'new-password' | 'name';
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-ink">{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secure}
        keyboardType={props.keyboard}
        autoComplete={props.autoComplete}
        autoCapitalize={props.keyboard === 'email-address' || props.secure ? 'none' : 'words'}
        autoCorrect={false}
        placeholderTextColor={colors.faint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          ...NO_WEB_FOCUS_RING,
          borderWidth: 1.5,
          borderColor: focused ? colors.primary : colors.line,
          backgroundColor: focused ? colors.white : colors.surface,
        }}
        className="rounded-xl px-4 py-3 text-base text-ink"
      />
    </View>
  );
}

function SignInForm() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    fetchServerConfig()
      .then((config) => setGoogle(config.google))
      .catch(() => setGoogle(false));
  }, []);

  async function submit() {
    setError(null);
    if (!email.trim() || !password || (mode === 'sign-up' && !name.trim())) {
      setError('Please fill in every field.');
      return;
    }
    if (mode === 'sign-up' && password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    setBusy(true);
    try {
      const result =
        mode === 'sign-up'
          ? await authClient.signUp.email({
              name: name.trim(),
              email: email.trim(),
              password,
            })
          : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) setError(result.error.message ?? 'Something went wrong. Please try again.');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setError(null);
    const callbackURL = Platform.OS === 'web' ? `${window.location.origin}/account` : '/account';
    const result = await authClient.signIn.social({
      provider: 'google',
      callbackURL,
    });
    if (result?.error) setError(result.error.message ?? 'Google sign-in failed.');
  }

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="w-full max-w-xl self-center p-5 gap-4"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <Text className="text-2xl font-extrabold text-ink">
          {mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
        </Text>
        <Text className="text-base text-muted">
          Back up your decks and notes, use them on every device, and connect AI apps to NoteMe. Everything you made as
          a guest moves into your account.
        </Text>
      </View>

      <View className="flex-row rounded-2xl bg-surface p-1" accessibilityRole="tablist">
        {(['sign-in', 'sign-up'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => {
              setMode(m);
              setError(null);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === m }}
            className={`flex-1 items-center rounded-xl py-2.5 ${mode === m ? 'bg-white' : ''}`}
          >
            <Text className={`text-base font-semibold ${mode === m ? 'text-ink' : 'text-muted'}`}>
              {m === 'sign-in' ? 'Sign in' : 'Create account'}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === 'sign-up' ? <Field label="Name" value={name} onChangeText={setName} autoComplete="name" /> : null}
      <Field label="Email" value={email} onChangeText={setEmail} keyboard="email-address" autoComplete="email" />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secure
        autoComplete={mode === 'sign-up' ? 'new-password' : 'password'}
      />

      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-alert">
          {error}
        </Text>
      ) : null}

      <Button
        label={busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
        onPress={() => void submit()}
        disabled={busy}
      />

      {google ? (
        <>
          <View className="flex-row items-center gap-3">
            <View className="h-px flex-1 bg-line" />
            <Text className="text-sm text-muted">or</Text>
            <View className="h-px flex-1 bg-line" />
          </View>
          <Button
            label="Continue with Google"
            icon="logo-google"
            variant="secondary"
            onPress={() => void signInWithGoogle()}
          />
        </>
      ) : null}
    </ScrollView>
  );
}
