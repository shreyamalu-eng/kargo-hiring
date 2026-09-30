import { Suspense } from "react";
import Shell from "../../ui/Shell";
import RoleEditor from "../RoleEditor";

export const metadata = { title: "New role · Kargo Hiring" };
export const dynamic = "force-dynamic";

export default function NewRole() {
  return (
    <Shell active="roles">
      <Suspense>
        <RoleEditor mode="new" />
      </Suspense>
    </Shell>
  );
}
