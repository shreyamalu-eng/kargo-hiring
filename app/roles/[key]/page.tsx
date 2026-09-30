import { notFound } from "next/navigation";
import { getCriteria, getRole, listCandidates } from "@/lib/db";
import { Suspense } from "react";
import Shell from "../../ui/Shell";
import RoleEditor from "../RoleEditor";

export const dynamic = "force-dynamic";

export default async function EditRole({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const role = await getRole(decodeURIComponent(key));
  if (!role) notFound();
  const [criteria, all] = await Promise.all([getCriteria(role.key), listCandidates()]);
  return (
    <Shell active={role.key}>
      <Suspense>
        <RoleEditor
        mode="edit"
        role={role}
        criteria={criteria.map((c) => ({ key: c.key, name: c.name, description: c.description, weight: c.weight }))}
        candidates={all.filter((c) => c.applied_role === role.key).length}
      />
      </Suspense>
    </Shell>
  );
}
