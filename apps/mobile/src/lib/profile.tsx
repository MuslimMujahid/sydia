import { createContext, useContext, type ReactNode } from "react";
import type { UserProfile } from "@/lib/services/api/users/users.api";

const ProfileContext = createContext<UserProfile | null>(null);

/** Supplies the signed-in profile (time zone, locale) to every app screen. */
export function ProfileProvider({
  profile,
  children,
}: {
  profile: UserProfile;
  children: ReactNode;
}) {
  return (
    <ProfileContext.Provider value={profile}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): UserProfile {
  const profile = useContext(ProfileContext);
  if (!profile)
    throw new Error("useProfile must be used inside the signed-in app layout.");

  return profile;
}
