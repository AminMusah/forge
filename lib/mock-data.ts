export interface Model {
  id: string;
  name: string;
  description: string;
}

export interface Chat {
  id: string;
  title: string;
  updatedAt: string;
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
  { id: "c1", title: "Plan a trip to Zanzibar", updatedAt: "2026-07-12" },
  { id: "c2", title: "Explain zustand selectors", updatedAt: "2026-07-11" },
  { id: "c3", title: "Refactor sidebar layout", updatedAt: "2026-07-11" },
  { id: "c4", title: "SQL query for monthly revenue", updatedAt: "2026-07-10" },
  { id: "c5", title: "Draft a cover letter", updatedAt: "2026-07-09" },
  { id: "c6", title: "Tailwind v4 theme tokens", updatedAt: "2026-07-08" },
  { id: "c7", title: "Debug Next.js hydration error", updatedAt: "2026-07-06" },
  { id: "c8", title: "Ideas for a side project", updatedAt: "2026-07-04" },
];

export const mockUser: MockUser = {
  name: "Ameen",
  email: "ahmdmus19@gmail.com",
  initials: "AM",
};
