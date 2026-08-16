const pg = require(`${process.env.HOME}/Documents/marina-api/node_modules/pg`);
const OriginalPool = pg.Pool;
function PatchedPool(this: unknown, cfg: Record<string, unknown>) {
  return new OriginalPool({ ...cfg, ssl: false });
}
PatchedPool.prototype = OriginalPool.prototype;
pg.Pool = PatchedPool;
require('/Users/marinahealth/Documents/marina-api/migrations/run');
