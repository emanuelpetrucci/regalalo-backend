import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateOpenApiDocument, resetOpenApiDocumentCache } from '../src/openapi/document';

const root = join(__dirname, '..');
const outDir = join(root, 'openapi');
const outFile = join(outDir, 'openapi.json');

resetOpenApiDocumentCache();
const doc = generateOpenApiDocument();

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(doc, null, 2), 'utf-8');

console.log(`OpenAPI spec written to ${outFile}`);
