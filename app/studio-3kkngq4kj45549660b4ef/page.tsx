import type { Metadata } from "next";
import Studio from "./Studio";

/**
 * The post studio — an internal tool, not part of the site. Nothing links here
 * and the path is a random string so nobody lands on it by accident; keep the
 * URL. It is hidden, not private: the path is in the repository.
 */
export const metadata: Metadata = {
  title: "Studio — STROMA",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <Studio />;
}
