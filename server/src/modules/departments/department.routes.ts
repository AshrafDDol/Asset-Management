import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import {
    getDepartmentsController,
    getDepartmentByIdController,
    createDepartmentController,
    updateDepartmentController,
    deleteDepartmentController
} from './department.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', getDepartmentsController);
router.get('/:id', getDepartmentByIdController);
router.post('/', createDepartmentController);
router.put('/:id', updateDepartmentController);
router.delete('/:id', deleteDepartmentController);

export default router;