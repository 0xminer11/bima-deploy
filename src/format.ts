// Terminal output helpers. ANSI colours are dropped when piped, or when NO_COLOR is set.

const colorOn = (stream: NodeJS.WriteStream) =>
  !process.env.NO_COLOR && (!!process.env.FORCE_COLOR || !!stream.isTTY);

const wrap = (open: number, close: number) => (s: string, stream: NodeJS.WriteStream = process.stdout) =>
  colorOn(stream) ? `\x1b[${open}m${s}\x1b[${close}m` : s;

export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const red = wrap(31, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
export const cyan = wrap(36, 39);

export type Row = [label: string, value: string];

/** Aligned `label  value` lines, indented. */
export function kv(rows: Row[], indent = 4): string {
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, value]) => `${" ".repeat(indent)}${dim(label.padEnd(width))}  ${value}`).join("\n");
}

/** Section banner printed once per chain. */
export function banner(title: string, subtitle?: string): void {
  console.log(`\n${bold(cyan(`== ${title}`))}${subtitle ? `  ${dim(subtitle)}` : ""}`);
}

export const step = (msg: string) => console.log(`  ${dim("-")} ${msg}`);
export const ok = (msg: string) => console.log(`  ${green("ok")} ${msg}`);
export const fail = (msg: string) => console.error(`  ${red("FAILED", process.stderr)} ${msg}`);

export const txUrl = (explorerUrl: string | undefined, hash: string) => (explorerUrl ? `${explorerUrl}/tx/${hash}` : hash);
