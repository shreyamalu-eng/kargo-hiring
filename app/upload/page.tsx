import { getRoles } from "@/lib/db";
import Shell from "../ui/Shell";
import Uploader from "./Uploader";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams;
  const roles = await getRoles().catch(() => []);
  const initial = roles.find((r) => r.key === sp.role)?.key ?? (roles.length === 1 ? roles[0].key : null);
  return (
    <Shell active="upload">
      <Uploader initialRole={initial} roles={roles.map((r) => ({ key: r.key, title: r.title, tagline: r.tagline }))} />
    </Shell>
  );
}
