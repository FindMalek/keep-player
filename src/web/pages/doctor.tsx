import { useQuery } from "@tanstack/react-query";
import { Content, EmptyState, PageHeader, Section } from "@/components/library";
import { Link } from "@/components/link";
import { TrackListSkeleton } from "@/components/skeletons";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { apiQueries } from "@/lib/api-queries";
import { doctorQuery } from "@/lib/doctor-query";
import { plural } from "@/lib/format";
import type { Check } from "../../shared/doctor";

function CheckSection({ check }: { check: Check }) {
  const clean = check.count === 0;
  return (
    <Section title={`${check.title} · ${check.count.toLocaleString()}`}>
      <div className="flex flex-col gap-2 px-4 pb-4">
        <p className="text-muted-foreground text-sm">{clean ? "nothing to fix" : check.hint}</p>
        {!clean && (
          <Table className="font-mono">
            <TableBody>
              {check.findings.map((finding) => (
                <TableRow key={`${finding.songId ?? finding.albumId}-${finding.label}`}>
                  <TableCell className="max-w-96 truncate">
                    {finding.albumId ? (
                      <Link href={`/album/${encodeURIComponent(finding.albumId)}`} className="hover:underline">
                        {finding.label}
                      </Link>
                    ) : (
                      finding.label
                    )}
                  </TableCell>
                  <TableCell className="max-w-96 truncate text-muted-foreground">{finding.detail}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {check.count > check.findings.length && (
          <p className="font-mono text-muted-foreground text-xs">+ {(check.count - check.findings.length).toLocaleString()} more</p>
        )}
      </div>
    </Section>
  );
}

/** Admins: what's missing or odd in the indexed library, with a fix hint per check, and an overall health score. */
export function DoctorPage() {
  const admin = useQuery(apiQueries.session()).data?.admin;
  const report = useQuery({ ...doctorQuery, enabled: Boolean(admin) });
  const data = report.data;
  return (
    <>
      <PageHeader
        title="library doctor"
        meta={
          data
            ? `${plural(
                data.checks.reduce((sum, check) => sum + check.count, 0),
                "issue",
              )} found`
            : undefined
        }
      />
      <Content>
        {admin === false ? (
          <EmptyState>the library doctor is for navidrome admins</EmptyState>
        ) : report.isError ? (
          <EmptyState>couldn't run the checks</EmptyState>
        ) : !data ? (
          <TrackListSkeleton count={4} />
        ) : (
          <div className="flex max-w-xl flex-col gap-2">
            <Progress value={data.health}>
              <ProgressLabel className="font-mono">library health</ProgressLabel>
              <ProgressValue className="font-mono" />
            </Progress>
            <p className="text-muted-foreground text-sm">
              checks run on the search index. lyrics have their own page:{" "}
              <Link href="/lyrics" className="underline">
                lyrics coverage
              </Link>
              . cover resolution isn't in the index, so only missing covers are caught.
            </p>
          </div>
        )}
      </Content>
      {data?.checks.map((check) => (
        <CheckSection key={check.id} check={check} />
      ))}
    </>
  );
}
