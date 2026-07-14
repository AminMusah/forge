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
    id: "openai/whisper-large-v3-turbo",
    name: "Whisper Large v3 Turbo",
    description: "Fast, high-quality transcription · needs a token",
    task: "automatic-speech-recognition",
    runtime: "server",
    // hf-inference is the ONLY live provider for this model, and single-provider
    // models fail the router's automatic selection — pin it. (v3 below is served
    // by three, so it auto-routes and must NOT be pinned.)
    provider: "hf-inference",
  },
  {
    id: "openai/whisper-large-v3",
    name: "Whisper Large v3",
    description: "Best-quality transcription · needs a token",
    task: "automatic-speech-recognition",
    runtime: "server",
  },
  {
    id: "onnx-community/whisper-base",
    name: "Whisper Base (local)",
    description: "Transcribes on your GPU · the audio never leaves your machine",
    task: "automatic-speech-recognition",
    runtime: "browser",
  },
];
