import { labOn } from './labs';

/** "Задача сразу целиком": a task opens to all of it at once, not to its description first (that
 *  view kept, to come back to with the switch off). */
export const taskOpen = (): 'desc' | 'full' => (labOn('taskFull') ? 'full' : 'desc');
