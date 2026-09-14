import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { cancelSwap, confirmReturns, confirmSwap, counts, prepareSwap, returns, swap, swaps, verifySwap } from './handheldWork.controller';

const router = Router();
router.use(authMiddleware);
router.get('/counts', counts);
router.get('/returns', returns);
router.post('/returns/confirm', confirmReturns);
router.get('/swaps', swaps);
router.post('/swaps', prepareSwap);
router.get('/swaps/:id', swap);
router.post('/swaps/:id/verify', verifySwap);
router.post('/swaps/:id/confirm', confirmSwap);
router.post('/swaps/:id/cancel', cancelSwap);
export default router;
