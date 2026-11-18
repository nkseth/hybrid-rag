import { connection } from "next/server";
import { q } from "@/lib/db";

/** Top-N most-mentioned nodes + edges between them, for the graph explorer. */
export async function GET() {
  await connection();
  const nodes = await q<{ id: number; name: string; type: string; mentions: number }>(
    `SELECT n.id, n.name, n.type, COUNT(m.chunk_id) AS mentions FROM nodes n JOIN mentions m ON m.node_id = n.id
     GROUP BY n.id ORDER BY mentions DESC LIMIT 300`,
  );
  const ids = nodes.map((n) => n.id);
  const links = ids.length
    ? await q<{ source: number; target: number; rel: string; weight: number }>(
        `SELECT src AS source, dst AS target, rel, COUNT(*) AS weight FROM edges
         WHERE src IN (SELECT value FROM json_each(?1)) AND dst IN (SELECT value FROM json_each(?1)) GROUP BY src, dst, rel`,
        [JSON.stringify(ids)],
      )
    : [];
  return Response.json({ nodes, links });
}
