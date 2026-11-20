import type { NativeStackNavigationOptions } from "expo-router";
import { Platform } from "react-native";
import { fonts } from "@/lib/fonts";
import { colors } from "@/lib/theme";

/** Native header styling shared by every stack: bone bar, Inter titles. */
export const stackScreenOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.foreground,
  headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17 },
  headerLargeTitleStyle: { fontFamily: fonts.bold },
  headerShadowVisible: false,
  headerLargeTitleShadowVisible: false,
  headerBackButtonDisplayMode: "minimal",
  contentStyle: { backgroundColor: colors.background },
};

/** Top-level feature area: collapsing large title on iOS, Material bar on Android. */
export const areaScreenOptions: NativeStackNavigationOptions = {
  headerLargeTitleEnabled: Platform.OS === "ios",
};

/**
 * Create and edit forms: a page sheet on iOS and a full-screen dialog on
 * Android, each with Batal and Simpan in the native header.
 */
export const formModalOptions: NativeStackNavigationOptions = {
  presentation: "modal",
  headerLargeTitleEnabled: false,
  gestureEnabled: true,
};

/** Short pickers and menus that fit a bottom sheet. */
export const sheetOptions: NativeStackNavigationOptions = {
  presentation: "formSheet",
  headerShown: false,
  sheetGrabberVisible: true,
  sheetCornerRadius: 22,
  sheetAllowedDetents: [0.5, 1],
  contentStyle: { backgroundColor: colors.card },
};
