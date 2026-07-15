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
