import { Router } from 'express';
import { createRoleController, deleteRoleController, getRoleByIdController, getRolesController, updateRoleController } from './role.controller';

const router = Router();

router.get('/', getRolesController);
router.get('/:id', getRoleByIdController);
router.post('/', createRoleController);
router.put('/:id', updateRoleController);
router.delete('/:id', deleteRoleController);

export default router;
