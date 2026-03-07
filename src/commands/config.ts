import path from 'node:path';
import os from 'node:os';

export const DEFAULT_DATA_DIR = path.join(os.homedir(), '.drift-watch');
