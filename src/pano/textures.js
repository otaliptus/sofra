import {assetURL} from '../shared/asset-url.js';

// These decorative maps cover at most a 640px print. CPU masks, food contours,
// spread relief and the newspaper lettering use the original artwork.
const compact=new Set(['kareli-bezi','tokat-bezi','kahvalti-tabagi','drink-art','milk-art','tas-ekmek-crust','acma-crust','pogaca-crust']);
export const printAssetURL=id=>assetURL(compact.has(id)?'pano-'+id:id);
