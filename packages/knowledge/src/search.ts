import { spawn } from 'child_process';

export interface RgHit {
  file: string;
  line: number;
  text: string;
}

export interface RgOptions {
  paths: string[];
  glob?: string[];
  maxCount?: number;
  caseInsensitive?: boolean;
}

const DEFAULT_PRUNE = ['!**/temp/**', '!**/_archive/**', '!**/build/**', '!**/classes/**', '!**/node_modules/**', '!**/gensrc/**'];

export function ripgrep(query: string, opts: RgOptions): Promise<RgHit[]> {
  return new Promise((resolve, reject) => {
    const args: string[] = [
      '--json',
      '--no-heading',
      '-n',
      '--max-columns=400',
      '--max-filesize=2M',
    ];
    if (opts.caseInsensitive) args.push('-i');
    if (opts.maxCount) args.push('-m', String(opts.maxCount));
    for (const g of [...DEFAULT_PRUNE, ...(opts.glob ?? [])]) args.push('-g', g);
    args.push('-e', query);
    for (const p of opts.paths) args.push(p);

    const proc = spawn('rg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const hits: RgHit[] = [];
    let buf = '';
    proc.stdout.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'match') {
            hits.push({
              file: obj.data.path.text,
              line: obj.data.line_number,
              text: (obj.data.lines.text as string).replace(/\n+$/, ''),
            });
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      // rg exits 1 when no matches — not an error for us
      if (code !== 0 && code !== 1) {
        reject(new Error(`rg exited ${code}: ${stderr}`));
        return;
      }
      resolve(hits);
    });
  });
}
