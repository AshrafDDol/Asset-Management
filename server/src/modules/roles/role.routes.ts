import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { createRoleController, deleteRoleController, getRoleByIdController, getRolesController, updateRoleController } from './role.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', getRolesController);
router.get('/:id', getRoleByIdController);
router.post('/', createRoleController);
router.put('/:id', updateRoleController);
router.delete('/:id', deleteRoleController);

export default router;
