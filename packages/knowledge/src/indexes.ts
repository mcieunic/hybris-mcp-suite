import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface ExtensionRecord {
  name: string;
  section: string;
  path: string;
  abs_path: string;
  requires: string[];
  kinds: string[];
  meta: Record<string, string>;
}

export interface ItemRecord {
  code: string;
  extends: string | null;
  deployment_table: string | null;
  attributes_count: number;
  attributes: Array<{ qualifier: string; type: string | null }>;
  extension: string;
  file: string;
}

export interface BeanRecord {
  class: string;
  extends?: string | null;
  type: string;
  extension: string;
  file: string;
}

export interface SpringBeanRecord {
  id: string | null;
  class: string | null;
  parent: string | null;
  scope: string | null;
  abstract: boolean;
  extension: string;
  file: string;
}

export interface ServiceFacadeRecord {
  interface: string;
  kind: string;
  package: string;
  extension: string;
  file: string;
}

export interface IndexBundle {
  extensions: ExtensionRecord[];
  items: ItemRecord[];
  beans: BeanRecord[];
  springBeans: SpringBeanRecord[];
  servicesFacades: ServiceFacadeRecord[];
}

let cache: IndexBundle | null = null;
let cacheRoot: string | null = null;

export function loadIndexes(kbRoot: string): IndexBundle {
  if (cache && cacheRoot === kbRoot) return cache;
  const indexDir = join(kbRoot, 'index');
  const read = <T>(name: string): T[] => {
    const p = join(indexDir, name);
    if (!existsSync(p)) {
      throw new Error(`Index file missing: ${p}. Run scripts/scan.py first.`);
    }
    return JSON.parse(readFileSync(p, 'utf-8')) as T[];
  };
  cache = {
    extensions: read<ExtensionRecord>('extensions.json'),
    items: read<ItemRecord>('items.json'),
    beans: read<BeanRecord>('beans.json'),
    springBeans: read<SpringBeanRecord>('spring-beans.json'),
    servicesFacades: read<ServiceFacadeRecord>('services-facades.json'),
  };
  cacheRoot = kbRoot;
  return cache;
}
