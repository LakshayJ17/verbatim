import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Create",
};

export default async function CreatePage() {
  redirect("/dashboard/new");
}
