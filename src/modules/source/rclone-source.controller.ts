import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { RcloneSourceService } from './rclone-source.service.js';
export function createRcloneSourceRouter(service:RcloneSourceService):Router {
  const router=Router();
  router.get('/api/sources/rclone',asyncHandler(async(_req,res)=>{res.json({items:await service.listSources()});}));
  router.get('/api/sources/rclone/:name/browse',asyncHandler(async(req,res)=>{res.json({items:await service.browse(req.params.name,String(req.query.path??''))});}));
  router.post('/api/sources/rclone/:name/test',asyncHandler(async(req,res)=>{res.json(await service.test(req.params.name,String(req.body?.path??'')));}));
  return router;
}
