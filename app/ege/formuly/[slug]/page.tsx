import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArticleView, { articleMetadata } from "@/components/seo/ArticleView";
import { articlesIn, findArticle } from "@/lib/seo/articles";

export const dynamicParams = false;

export function generateStaticParams() {
  return articlesIn("formuly").map((a) => ({ slug: a.slug }));
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = findArticle("formuly", (await props.params).slug);
  return a ? articleMetadata(a) : {};
}

export default async function Page(props: { params: Promise<{ slug: string }> }) {
  const a = findArticle("formuly", (await props.params).slug);
  if (!a) notFound();
  return <ArticleView a={a} />;
}
