import type { CommandRecord } from "@ukemi/domain";

/** Shell-quote one argv for display and copying. */
export function shellLine(record: Pick<CommandRecord, "program" | "args">): string {
  const quoted = record.args.map((arg) =>
    /^[A-Za-z0-9_@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`,
  );
  return [record.program, ...quoted].join(" ");
}

/** A read carries `--ignore-working-copy`; everything else changed something. */
export function isRead(record: CommandRecord): boolean {
  if (record.program === "gh") return record.args[0] === "pr" && record.args[1] === "list";
  return record.args.includes("--ignore-working-copy");
}
