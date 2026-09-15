import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { cancel, complete, create, get, list, scan } from './stockTake.controller';

const router = Router();
router.use(authMiddleware);
router.get('/', list);
router.post('/', create);
router.get('/:id', get);
router.post('/:id/scans', scan);
router.post('/:id/complete', complete);
router.post('/:id/cancel', cancel);
export default router;
