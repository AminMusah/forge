import { useChatStore } from "@/hooks/use-chat-store";

const REPLIES = [
  "Good question. The short answer is: it depends on what you're optimizing for. If you want the simplest thing that works today, start small and refactor when the pain shows up. If you already know the requirements will grow, it's worth spending a little extra time on structure now — future you will thank present you.",
  "Here's how I'd think about it. First, get clear on the actual goal — not the solution you have in mind, but the outcome you want. Second, list the constraints that are truly fixed versus the ones that are just habits. Most problems get much easier once you realize half the constraints were self-imposed.",
  "There are a few ways to approach this. The pragmatic route is to copy a pattern that already works and adapt it. The thorough route is to understand the underlying mechanism so you can derive the answer yourself. For most day-to-day work, pragmatic wins — save the deep dives for the parts of the system you own long-term.",
  "That's a classic trade-off. My general advice: make it correct first, then make it fast, and only optimize the paths you've actually measured. Premature optimization doesn't just waste time — it usually makes the code harder to change right when you learn what it really needs to do.",
  "Let me break that down. The core idea is simpler than it looks once you strip away the jargon. Think of it as three layers: what you store, how you read it, and when things update. Get those three boundaries clean and everything else — caching, testing, refactoring — becomes much more straightforward.",
];

const THINKING_DELAY_MS = 600;
const WORD_INTERVAL_MS = 60;

/**
 * Streams a canned assistant reply into the chat, word by word.
 * Writes through the store directly, so it keeps going across navigations
 * and stops safely if the chat is deleted mid-stream.
 */
export function requestMockReply(chatId: string) {
  const reply = REPLIES[Math.floor(Math.random() * REPLIES.length)];

  setTimeout(() => {
    const messageId = useChatStore.getState().addAssistantMessage(chatId);
    if (!messageId) return;

    const words = reply.split(" ");
    let index = 0;
    const timer = setInterval(() => {
      const chunk = (index === 0 ? "" : " ") + words[index];
      const ok = useChatStore.getState().appendToMessage(chatId, messageId, chunk);
      index += 1;
      if (!ok || index >= words.length) clearInterval(timer);
    }, WORD_INTERVAL_MS);
  }, THINKING_DELAY_MS);
}
