import Shell from "../ui/Shell";
import Uploader from "./Uploader";

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams;
  const role = sp.role === "SPM" ? "SPM" : sp.role === "PM" ? "PM" : null;
  return (
    <Shell active="upload">
      <Uploader initialRole={role} />
    </Shell>
  );
}
