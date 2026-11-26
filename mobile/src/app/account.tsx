import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextStyle,
} from "react-native";

import { Button, colors, Icon, type IconName } from "@/components/ui";
import { useAccount } from "@/providers/account";
import { authClient } from "@/services/auth-client";
import { confirm } from "@/lib/confirm";
import { syncedAgo } from "@/lib/dates";
import { useServerConfig } from "@/services/queries";
import type { SocialProvider } from "@/services/sync-api";

const NO_WEB_FOCUS_RING = { outlineStyle: "none" } as unknown as TextStyle;

const PROVIDERS: Record<SocialProvider, { label: string; icon: IconName }> = {
  google: { label: "Google", icon: "logo-google" },
  microsoft: { label: "Microsoft", icon: "logo-microsoft" },
  facebook: { label: "Facebook", icon: "logo-facebook" },
};

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
  const { user, syncStatus, syncError, lastSyncedAt, syncNow, signOut } =
    useAccount();
  const [signingOut, setSigningOut] = useState(false);
  if (!user) return null;

  async function onSignOut() {
    const ok = await confirm(
      "Sign out?",
      "Your decks and notes stay in your account and are removed from this device.",
      "Sign out",
    );
    if (!ok) return;
    setSigningOut(true);
    try {
      let result = await signOut();
      if (result) {
        const force = await confirm(
          "Some changes are not saved",
          `${result.unsynced} change(s) could not reach your account (are you offline?). Sign out anyway and lose them?`,
          "Sign out anyway",
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
    syncStatus === "syncing"
      ? "Syncing…"
      : syncStatus === "error"
        ? (syncError ?? "Sync failed.")
        : lastSyncedAt
          ? `Synced ${syncedAgo(lastSyncedAt)}`
          : "Not synced yet";

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="w-full max-w-xl self-center p-5 gap-5"
    >
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
            name={
              syncStatus === "error"
                ? "cloud-offline-outline"
                : "cloud-done-outline"
            }
            size={26}
            color={syncStatus === "error" ? colors.alert : colors.calm}
          />
          <View className="flex-1">
            <Text className="text-base font-bold text-ink">Backup & sync</Text>
            <Text
              accessibilityLiveRegion="polite"
              className={`text-sm ${syncStatus === "error" ? "text-alert" : "text-muted"}`}
            >
              {status}
            </Text>
          </View>
        </View>
        <Text className="text-sm text-muted">
          Your decks, cards, notes, tags and attached files are saved to your
          account and kept the same on every device you sign in on.
        </Text>
        <Button
          label="Sync now"
          icon="sync-outline"
          variant="secondary"
          onPress={() => void syncNow()}
          disabled={syncStatus === "syncing"}
        />
      </View>

      <Button
        label={signingOut ? "Signing out…" : "Sign out"}
        icon="log-out-outline"
        variant="secondary"
        onPress={onSignOut}
        disabled={signingOut}
      />
    </ScrollView>
  );
}

// --- sign in / create account ------------------------------------------------------

type Mode = "sign-in" | "sign-up" | "forgot";

function Field(props: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** A password: hidden, with a Show/Hide button. */
  secure?: boolean;
  keyboard?: "email-address" | "default";
  autoComplete?: "email" | "password" | "new-password" | "name";
}) {
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-ink">{props.label}</Text>
      <View className="justify-center">
        <TextInput
          accessibilityLabel={props.label}
          value={props.value}
          onChangeText={props.onChangeText}
          secureTextEntry={props.secure && !shown}
          keyboardType={props.keyboard}
          autoComplete={props.autoComplete}
          autoCapitalize={
            props.keyboard === "email-address" || props.secure
              ? "none"
              : "words"
          }
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
          className={`rounded-xl px-4 py-3 text-base text-ink ${props.secure ? "pr-14" : ""}`}
        />
        {props.secure ? (
          <Pressable
            onPress={() => setShown((s) => !s)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={shown ? "Hide password" : "Show password"}
            className="absolute right-2 h-10 w-10 items-center justify-center rounded-full active:bg-line"
          >
            <Icon
              name={shown ? "eye-off-outline" : "eye-outline"}
              size={22}
              color={colors.muted}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function SignInForm() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socialBusy, setSocialBusy] = useState<SocialProvider | null>(null);
  /** Forgot password: the email the reset link was sent to. */
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);

  // Until the server answers, only email sign-in is shown. If it can't be reached, say so
  // (with a retry) rather than quietly leaving out Google and the others.
  const serverConfig = useServerConfig();
  const providers = serverConfig.data?.providers ?? [];
  const configFailed = serverConfig.isError && !serverConfig.isFetching;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setResetSentTo(null);
  }

  /** Forgot password: emails a link to choose a new one (it opens a page on the server). */
  async function sendResetLink() {
    setError(null);
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setError("Enter the email you signed up with.");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.requestPasswordReset({ email: address });
      if (result.error)
        setError(
          result.error.message ?? "Something went wrong. Please try again.",
        );
      else setResetSentTo(address);
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (mode === "forgot") return sendResetLink();
    setError(null);
    if (!email.trim() || !password || (mode === "sign-up" && !name.trim())) {
      setError("Please fill in every field.");
      return;
    }
    if (mode === "sign-up" && password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    setBusy(true);
    try {
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({
              name: name.trim(),
              email: email.trim(),
              password,
            })
          : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error)
        setError(
          result.error.message ?? "Something went wrong. Please try again.",
        );
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  /** Opens the provider's sign-in page; on phones it comes back to the app when done. */
  async function signInWith(provider: SocialProvider) {
    setError(null);
    setSocialBusy(provider);
    const callbackURL =
      Platform.OS === "web" ? `${window.location.origin}/account` : "/account";
    try {
      const result = await authClient.signIn.social({ provider, callbackURL });
      if (result?.error)
        setError(
          result.error.message ??
            `${PROVIDERS[provider].label} sign-in failed.`,
        );
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setSocialBusy(null);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="w-full max-w-xl self-center p-5 gap-4"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <Text className="text-2xl font-extrabold text-ink">
          {mode === "sign-in"
            ? "Welcome back"
            : mode === "sign-up"
              ? "Create your account"
              : "Reset your password"}
        </Text>
        <Text className="text-base text-muted">
          {mode === "forgot"
            ? "Enter the email you signed up with. We'll send you a link to choose a new password."
            : "Back up your decks and notes, use them on every device, and connect AI apps to StudyMe. Everything you made as a guest moves into your account."}
        </Text>
      </View>

      {mode === "forgot" ? null : providers.length > 0 ? (
        <>
          <View className="gap-3">
            {providers.map((provider) => (
              <Button
                key={provider}
                label={
                  socialBusy === provider
                    ? "Opening…"
                    : `Continue with ${PROVIDERS[provider].label}`
                }
                icon={PROVIDERS[provider].icon}
                variant="secondary"
                onPress={() => void signInWith(provider)}
                disabled={socialBusy !== null}
              />
            ))}
          </View>
          <View className="flex-row items-center gap-3">
            <View className="h-px flex-1 bg-line" />
            <Text className="text-sm text-muted">or use your email</Text>
            <View className="h-px flex-1 bg-line" />
          </View>
        </>
      ) : configFailed ? (
        <Pressable
          onPress={() => void serverConfig.refetch()}
          accessibilityRole="button"
          className="flex-row items-center gap-2 rounded-xl bg-surface px-3 py-2.5 active:bg-line"
        >
          <Icon name="cloud-offline-outline" size={18} color={colors.muted} />
          <Text className="flex-1 text-sm text-muted">
            {"Couldn't reach the server for Google and other sign-in options."}
          </Text>
          <Text className="text-sm font-semibold text-primary">Retry</Text>
        </Pressable>
      ) : null}

      {mode === "forgot" ? null : (
        <View
          className="flex-row rounded-2xl bg-surface p-1"
          accessibilityRole="tablist"
        >
          {(["sign-in", "sign-up"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => switchMode(m)}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              className={`flex-1 items-center rounded-xl py-2.5 ${mode === m ? "bg-white" : ""}`}
            >
              <Text
                className={`text-base font-semibold ${mode === m ? "text-ink" : "text-muted"}`}
              >
                {m === "sign-in" ? "Sign in" : "Create account"}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {mode === "sign-up" ? (
        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          autoComplete="name"
        />
      ) : null}
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboard="email-address"
        autoComplete="email"
      />
      {mode === "forgot" ? null : (
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secure
          autoComplete={mode === "sign-up" ? "new-password" : "password"}
        />
      )}
      {mode === "sign-in" ? (
        <Pressable
          onPress={() => switchMode("forgot")}
          accessibilityRole="button"
          hitSlop={6}
          className="-mt-2 self-end py-1"
        >
          <Text className="text-sm font-semibold text-primary">
            Forgot password?
          </Text>
        </Pressable>
      ) : null}

      {resetSentTo ? (
        <View
          accessibilityLiveRegion="polite"
          className="flex-row gap-3 rounded-xl bg-surface p-4"
        >
          <Icon name="mail-outline" size={22} color={colors.primary} />
          <Text className="flex-1 text-sm text-ink">
            {`If ${resetSentTo} has a StudyMe account, a link to choose a new password is on its way. It works for 1 hour. Check your spam folder too.`}
          </Text>
        </View>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-alert">
          {error}
        </Text>
      ) : null}

      <Button
        label={
          busy
            ? "Please wait…"
            : mode === "sign-in"
              ? "Sign in"
              : mode === "sign-up"
                ? "Create account"
                : resetSentTo
                  ? "Send the link again"
                  : "Send reset link"
        }
        onPress={() => void submit()}
        disabled={busy}
      />
      {mode === "forgot" ? (
        <Pressable
          onPress={() => switchMode("sign-in")}
          accessibilityRole="button"
          className="items-center py-2"
        >
          <Text className="text-sm font-semibold text-primary">
            Back to sign in
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
