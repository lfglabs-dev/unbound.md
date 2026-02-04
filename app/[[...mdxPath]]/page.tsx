import { buildDynamicMDX, buildDynamicMeta } from "nextra/remote";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: {
  params: Promise<{ mdxPath?: string[] }>;
}) {
  const params = await props.params;
  const mdxPath = params.mdxPath;
  return buildDynamicMeta(mdxPath);
}

export default async function Page(props: {
  params: Promise<{ mdxPath?: string[] }>;
}) {
  const params = await props.params;
  const mdxPath = params.mdxPath;
  const result = await buildDynamicMDX(mdxPath);

  if (!result) {
    notFound();
  }

  return result.html;
}
