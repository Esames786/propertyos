import type { Handler } from '../handler-types';
import { OPS_NOTICE_HANDLERS } from './notices-handlers';
import { OPS_REQUEST_HANDLERS } from './requests-handlers';
import { OPS_RESIDENT_HANDLERS } from './residents-handlers';
import { OPS_VEHICLE_HANDLERS } from './vehicles-handlers';
import { OPS_VISITOR_HANDLERS } from './visitors-handlers';

/** Gate D.2: resident operations and society maintenance (every endpoint declares its access). */
export const OPERATIONS_HANDLERS: readonly Handler[] = [...OPS_REQUEST_HANDLERS, ...OPS_VISITOR_HANDLERS, ...OPS_VEHICLE_HANDLERS, ...OPS_NOTICE_HANDLERS, ...OPS_RESIDENT_HANDLERS];

export { operationsRecordAccess, operationsSearch } from './residents-handlers';
export { DEFAULT_THRESHOLD, effectiveThreshold, refreshPublished, residentCount, type Counts, type Published, type Threshold } from './privacy';
export { slaOf, PRIORITY_OF_URGENCY } from './sla';
export { members, inAudience, flatsInScope } from './audience';
export { OPS_SECTION } from './state';
