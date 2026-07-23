import type { Metadata } from "next";
import { SharedPlayground } from "@/components/chat/shared-playground";
import { taskLabel } from "@/lib/hf-tasks";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ task?: string; model?: string }>;
}): Promise<Metadata> {
  const { task, model } = await searchParams;
  const modelName = model?.split("/").pop() ?? "a model";
  const label = task ? taskLabel(task) : "Playground";
  const title = `${label} · ${modelName}`;
  const description =
    "Run this model in your browser. No install, No account. Built with Forge.";
  // The route-segment `opengraph-image` convention prerenders once at build
  // time and ignores request-time searchParams in this Next version, so the
  // card is served from a plain Route Handler that reads them from req.url.
  const cardParams = new URLSearchParams();
  if (task) cardParams.set("task", task);
  if (model) cardParams.set("model", model);
  const cardUrl = `/p/card?${cardParams.toString()}`;
  const image = {
    url: cardUrl,
    width: 1200,
    height: 630,
    alt: "A Forge playground",
  };
  return {
    title,
    description,
    openGraph: { title, description, images: [image] },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [cardUrl],
    },
  };
}

export default function SharedPlaygroundPage() {
  return <SharedPlayground />;
}
