import { ConversationScreen } from "@/components/chat/conversation-screen";

/** The app opens straight into a new conversation so users can type at once. */
export default function HomeScreen() {
  return <ConversationScreen home />;
}
