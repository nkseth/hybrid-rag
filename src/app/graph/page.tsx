import { PageHeader } from "@/components/kit";
import { GraphExplorer } from "./graph-client";

export default function Page() {
  return (
    <>
      <PageHeader title="Knowledge Graph" description="Entities and relations extracted at ingest time, stored as nodes/edges tables in SQLite and walked with recursive CTEs at query time." />
      <GraphExplorer />
    </>
  );
}
