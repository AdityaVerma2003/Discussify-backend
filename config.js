import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

// Helper to define __dirname equivalent in ES Module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MAX_IMAGE_SIZE = 1024 * 1024 * 5; 

export { UPLOADS_DIR, MAX_IMAGE_SIZE };