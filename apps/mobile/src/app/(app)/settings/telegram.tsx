import { SettingsScroll } from "@/components/settings/settings-scroll";
import { TelegramConnectionPanel } from "@/components/settings/telegram-connection";

export default function TelegramSettingsScreen() {
  return (
    <SettingsScroll>
      <TelegramConnectionPanel />
    </SettingsScroll>
  );
}
