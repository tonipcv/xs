declare module 'ajv-formats' {
  import { Ajv } from 'ajv';
  export default function addFormats(ajv: Ajv, formats?: string[] | { mode?: 'fast' | 'full'; formats?: string[] }): Ajv;
}
