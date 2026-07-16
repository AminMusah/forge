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
  {
    id: "onnx-community/Qwen2.5-0.5B-Instruct",
    name: "Qwen2.5 0.5B (local)",
    description: "Runs in your browser on WebGPU · ~400MB first use",
    task: "text-generation",
    runtime: "browser",
  },
  {
    id: "onnx-community/whisper-base",
    name: "Whisper Base (local)",
    description: "Transcribes on your GPU · the audio never leaves your machine",
    task: "automatic-speech-recognition",
    runtime: "browser",
  },
  {
    id: "Xenova/detr-resnet-50",
    name: "DETR ResNet-50 (local)",
    description: "Detects objects in images · runs on your GPU",
    task: "object-detection",
    // The first playground task: no bespoke surface, its UI is generated from
    // the object-detection descriptor. Any browser object-detection model works.
    runtime: "browser",
  },
];

/**
 * What a fresh user lands on in chat. Deliberately the LOCAL model: it needs no
 * credentials, so it's the one chat that works on first open — cloud models are
 * strict-BYO and would 401 without a token. Local-open is the point; cloud is a
 * step-up. (Existing users keep their persisted selection; this is the default
 * only for someone with no stored choice.)
 */
export const defaultChatModel: Model =
  defaultModels.find((m) => m.runtime === "browser" && m.task === "text-generation") ??
  defaultModels[0];
