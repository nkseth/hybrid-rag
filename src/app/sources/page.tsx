import { PageHeader } from "@/components/kit";
import { SourcesClient } from "./sources-client";

export default function Page() {
  return (
    <>
      <PageHeader title="Sources" description="Continuous ingestion: uploads, re-crawled URLs and the local ./inbox watcher all feed one queue." />
      <SourcesClient />
    </>
  );
}
