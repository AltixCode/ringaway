import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { I18nManager, LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { isRTLLanguage, t } from "@/i18n";
import { bootstrapAds } from "@/monetization/ads";
import { shouldShowAds } from "@/monetization/entitlements";
import { preloadInterstitial } from "@/monetization/interstitial";
import {
  addCallNotificationResponseListener,
  configureCallNotificationHandler,
} from "@/notifications/callNotifications";
import { usePremiumStore } from "@/store/usePremiumStore";
import { ThemeProvider, useTheme } from "@/theme";

// Registered at module scope, once, the same way `SplashScreen.preventAutoHideAsync()` above
// is: it has to be in place before the first notification could possibly be delivered, which
// can be before any component has rendered.
configureCallNotificationHandler();

void SplashScreen.preventAutoHideAsync();

// Arabic and Persian must actually mirror the layout, not merely translate. This
// runs at module scope because React Native reads the flag when the first view
// is laid out — setting it from an effect leaves the first frame LTR.
I18nManager.allowRTL(true);
I18nManager.forceRTL(isRTLLanguage());

function RootNavigator() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const isPremium = usePremiumStore((s) => s.isPremium);
  const isReady = usePremiumStore((s) => s.isReady);
  const initialize = usePremiumStore((s) => s.initialize);

  useEffect(() => {
    void initialize();
    void SplashScreen.hideAsync();
  }, [initialize]);

  // Tapping the scheduled call notification (or the OS bringing the app forward for it)
  // opens straight to the call screen, wherever else in the stack the app happened to be —
  // the in-app countdown on the home screen only redirects itself while it is the screen on
  // top, and by the time a backgrounded call rings the user could be anywhere in the app.
  useEffect(() => {
    return addCallNotificationResponseListener(() => {
      router.replace("/call");
    });
  }, [router]);

  useEffect(() => {
    // Ads bootstrap (and the iOS tracking prompt) is deferred until we know the user is not
    // premium — a paying user is never shown a tracking prompt for ads they will never see.
    if (!shouldShowAds({ isPremium, isReady })) return;
    void bootstrapAds().then(() => preloadInterstitial());
  }, [isPremium, isReady]);

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: t("settingsTitle") }} />
        <Stack.Screen name="caller" options={{ title: t("callersTitle") }} />
        <Stack.Screen
          name="call"
          // No header and no swipe back: this screen imitates a call, and a call screen
          // is left by answering or declining it, not by a navigation gesture.
          options={{
            headerShown: false,
            gestureEnabled: false,
            animation: "fade",
          }}
        />
        <Stack.Screen
          name="paywall"
          options={{ title: "", presentation: "modal", headerShown: false }}
        />
      </Stack>
    </>
  );
}

/**
 * No LogBox toast in a capture build.
 *
 * Dropping the RevenueCat log level to ERROR silences its chatter but not its
 * errors -- and in a simulator the errors are unavoidable, because there is no
 * StoreKit for it to reach. React Native draws that as a toast docked at the
 * bottom of the screen, photographed on a 13" iPad sitting across a purchase
 * button. No log level can prevent it, because the error is real.
 *
 * Gated on `__DEV__` and the capture flag together: an ordinary debug build
 * keeps its warnings, a release build never reaches it.
 */
if (__DEV__ && process.env.EXPO_PUBLIC_CAPTURE_MODE === "1") {
  LogBox.ignoreAllLogs(true);
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <RootNavigator />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
