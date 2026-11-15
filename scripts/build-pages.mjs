import { cp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const output = '_site';
const base = process.env.PAGES_BASE || '/sisp-spaceapps/';
await mkdir(output, { recursive: true });
await cp('web', output, { recursive: true });
await mkdir(path.join(output, 'api'), { recursive: true });
await cp('dados/nasa_osdr/OSD-569/LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv', path.join(output, 'api/human-cbc'));
await cp('dados/nasa_osdr/OSD-575/LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv', path.join(output, 'api/metabolic-data'));
async function rewrite(dir) {
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await rewrite(file);
    else if (/\.(html|js|css)$/.test(file)) {
      const source = await readFile(file, 'utf8');
      const result = source.replace(/(["'`])\/(?!\/)(?=[a-zA-Z?]|\1)/g, (_, quote) => quote + base);
      await writeFile(file, result);
    }
  }
}
await rewrite(output);
await writeFile(path.join(output, '.nojekyll'), '');
console.log('Pages ready at ' + output + ' with base ' + base);
