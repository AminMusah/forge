export interface Model {
  id: string;
  name: string;
  description: string;
}

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
}

export interface Chat {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface MockUser {
  name: string;
  email: string;
  initials: string;
}

export const models: Model[] = [
  {
    id: "forge-1",
    name: "Forge 1",
    description: "Fast answers for everyday questions",
  },
  {
    id: "forge-1-pro",
    name: "Forge 1 Pro",
    description: "Deeper reasoning for complex work",
  },
  {
    id: "forge-1-mini",
    name: "Forge 1 Mini",
    description: "Lightweight and low-latency",
  },
];

export const seedChats: Chat[] = [
  {
    id: "c1",
    title: "Plan a trip to Zanzibar",
    updatedAt: "2026-07-12",
    messages: [
      {
        id: "c1-m1",
        role: "user",
        content: "I want to plan a week-long trip to Zanzibar in September. Where should I start?",
      },
      {
        id: "c1-m2",
        role: "assistant",
        content:
          "September is a great pick — dry season, warm water, and fewer crowds. A solid split for one week: 3 nights in Stone Town for the history and food scene, then 4 nights on the east coast (Paje or Jambiani) for the beaches. Book the Stone Town leg first; the good boutique stays fill up early.",
      },
      {
        id: "c1-m3",
        role: "user",
        content: "What should I absolutely not miss in Stone Town?",
      },
      {
        id: "c1-m4",
        role: "assistant",
        content:
          "Three things: the spice farm tour (go with a morning slot, it gets hot), the Forodhani night food market for grilled seafood and Zanzibar pizza, and just getting lost in the alleys around Jaws Corner — the carved doors are the real museum.",
      },
    ],
  },
  {
    id: "c2",
    title: "Explain zustand selectors",
    updatedAt: "2026-07-11",
    messages: [
      {
        id: "c2-m1",
        role: "user",
        content: "Why do people pass selectors to zustand hooks instead of destructuring the whole store?",
      },
      {
        id: "c2-m2",
        role: "assistant",
        content:
          "It's about re-renders. useStore() with no selector subscribes your component to every state change in the store. With a selector — useStore(s => s.chats) — the component only re-renders when that slice changes (compared by reference). Rule of thumb: select the smallest thing the component actually reads.",
      },
      {
        id: "c2-m3",
        role: "user",
        content: "And when I need two values?",
      },
      {
        id: "c2-m4",
        role: "assistant",
        content:
          "Either call the hook twice with two selectors (cheap and simple), or return an object from one selector and pass useShallow from zustand/shallow so the object is compared field-by-field instead of by reference. Never return a fresh object without shallow comparison — that re-renders on every store change.",
      },
    ],
  },
  {
    id: "c3",
    title: "Refactor sidebar layout",
    updatedAt: "2026-07-11",
    messages: [
      {
        id: "c3-m1",
        role: "user",
        content: "My sidebar and main content fight over height and the scrollbar keeps jumping. What's the right layout skeleton?",
      },
      {
        id: "c3-m2",
        role: "assistant",
        content:
          "Give the app shell a fixed viewport height (h-svh) with overflow-hidden, then make exactly one descendant scrollable. The classic mistake is letting both the page body and an inner panel scroll. Sidebar and content should be flex siblings; the content pane gets min-h-0 and overflow-auto so it can actually shrink — without min-h-0, flex children refuse to get smaller than their content and the scrollbar escapes to the body.",
      },
    ],
  },
  { id: "c4", title: "SQL query for monthly revenue", updatedAt: "2026-07-10", messages: [] },
  { id: "c5", title: "Draft a cover letter", updatedAt: "2026-07-09", messages: [] },
  { id: "c6", title: "Tailwind v4 theme tokens", updatedAt: "2026-07-08", messages: [] },
  { id: "c7", title: "Debug Next.js hydration error", updatedAt: "2026-07-06", messages: [] },
  { id: "c8", title: "Ideas for a side project", updatedAt: "2026-07-04", messages: [] },
];

export const mockUser: MockUser = {
  name: "Ameen",
  email: "ahmdmus19@gmail.com",
  initials: "AM",
};
