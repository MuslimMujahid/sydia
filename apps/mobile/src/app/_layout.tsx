import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { DefaultTheme, Stack, ThemeProvider, type Theme } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { resetLibraryUploads } from "@/components/files/upload-store";
import { ActionSheetProvider } from "@/components/ui/action-sheet";
import { ToastProvider } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";
import { FONT_ASSETS, fonts } from "@/lib/fonts";
import { createQueryClient, wireQueryLifecycle } from "@/lib/query-client";
import { colors } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();
wireQueryLifecycle();

const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.background,
    text: colors.foreground,
    border: colors.border,
    notification: colors.accent,
  },
  fonts: {
    regular: { fontFamily: fonts.regular, fontWeight: "400" },
    medium: { fontFamily: fonts.medium, fontWeight: "500" },
    bold: { fontFamily: fonts.semibold, fontWeight: "600" },
    heavy: { fontFamily: fonts.bold, fontWeight: "700" },
  },
};

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  const { data: session, isPending } = authClient.useSession();
  const accountId = session?.user.id;
  const previousAccount = useRef<string | undefined>(undefined);
  const isSignedIn = Boolean(session);
  const isVerified = Boolean(session?.user.emailVerified);
  const ready = (fontsLoaded || Boolean(fontError)) && !isPending;

  useEffect(() => {
    if (fontError)
      console.warn("Fonts failed to load; using system fonts", fontError);
  }, [fontError]);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // Never let one account's cached data reach the next sign-in.
  useEffect(() => {
    if (isPending || previousAccount.current === accountId) return;
    if (previousAccount.current) {
      resetLibraryUploads();
      queryClient.clear();
    }
    previousAccount.current = accountId;
  }, [accountId, isPending, queryClient]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={navigationTheme}>
          <ActionSheetProvider>
            <ToastProvider>
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                }}
              >
                <Stack.Protected guard={isSignedIn && isVerified}>
                  <Stack.Screen name="(app)" />
                </Stack.Protected>
                <Stack.Protected guard={isSignedIn && !isVerified}>
                  <Stack.Screen name="verify-email" />
                </Stack.Protected>
                <Stack.Protected guard={!isSignedIn}>
                  <Stack.Screen name="sign-in" />
                  <Stack.Screen name="sign-up" />
                  <Stack.Screen name="forgot-password" />
                </Stack.Protected>
              </Stack>
            </ToastProvider>
          </ActionSheetProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
