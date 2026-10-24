import type { MetadataRoute } from "next";

/** Nothing in Éclaira is public: patient links and the clinic app stay out of search engines. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
