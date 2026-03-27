import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { parseOrBadRequest } from '../../lib/request-parser.js';
import { BrowseLocalPathQuerySchema } from './local-path.dto.js';
import { LocalPathService } from './local-path.service.js';

export function createLocalPathRouter(service: LocalPathService): Router {
  const router = Router();

  router.get(
    '/api/local-paths',
    asyncHandler(async (req, res) => {
      const query = parseOrBadRequest(BrowseLocalPathQuerySchema, req.query, {
        message: 'Invalid local path query payload'
      });
      const result = await service.browse(query.path);
      res.status(200).json(result);
    })
  );

  return router;
}
