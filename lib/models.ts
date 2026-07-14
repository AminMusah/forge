import type { Model } from "@/lib/types";

/** Curated defaults; users add more via Hugging Face model search. */
export const defaultModels: Model[] = [
  {
    id: "meta-llama/Llama-3.3-70B-Instruct",
    name: "Llama 3.3 70B Instruct",
    description: "Versatile all-rounder for complex work",
    task: "text-generation",
  },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT-OSS 120B",
    description: "High-performance open reasoning model",
    task: "text-generation",
  },
  {
    id: "meta-llama/Llama-3.1-8B-Instruct",
    name: "Llama 3.1 8B Instruct",
    description: "Lightweight and low-latency",
    task: "text-generation",
  },
];
