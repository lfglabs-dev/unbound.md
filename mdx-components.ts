import type { MDXComponents } from "nextra/mdx";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
  };
}
