import { Router } from 'express';
import {
    getDepartmentsController,
    getDepartmentByIdController,
    createDepartmentController,
    updateDepartmentController,
    deleteDepartmentController
} from './department.controller';

const router = Router();

router.get('/', getDepartmentsController);
router.get('/:id', getDepartmentByIdController);
router.post('/', createDepartmentController);
router.put('/:id', updateDepartmentController);
router.delete('/:id', deleteDepartmentController);

export default router;